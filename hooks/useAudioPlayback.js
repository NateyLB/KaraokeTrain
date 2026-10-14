import { useRef, useEffect, useCallback, useMemo } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { selectedLyrics } from '../lib/lyrics/timeline';
import { MultiplexGraph } from '../lib/audio/MultiplexGraph';
import { getAudioRuntime } from '../lib/audio/runtime';
import { playMedia as safePlay, pauseMedia as safePause } from '../lib/audio/media';
import { PartyClient } from '../lib/party/PartyClient';

/**
 * Owns all audio playback state that is imperative / ref-based:
 *   - audioRefs (vocals, no_vocals <audio> elements)
 *   - ytPlayerRef (YouTube iframe API)
 *   - timeUpdateInterval
 *
 * Reads/writes everything else through the Zustand store.
 *
 * Returns: { togglePlay, handleNextSong, handleSeek, handleAlignStart,
 *            handleYouTubeStateChange, audioRefs, ytPlayerRef }
 */
export function useAudioPlayback(roomId) {
  const audioRefs = useRef({ multiplex: null });
  const ytPlayerRef = useRef(null);
  const timeUpdateInterval = useRef(null);
  const isPlayingRef = useRef(false);
  const advanceInFlightRef = useRef(false);

  const graphRef = useRef(null);
  const client = useMemo(() => new PartyClient(roomId), [roomId]);

  const wireWebAudio = useCallback(() => {
    const audio = audioRefs.current.multiplex;
    if (!audio) return;
    try {
      if (!graphRef.current) graphRef.current = new MultiplexGraph();
      graphRef.current.attach(audio);
      const { vocalsEnabled, vocalsVolume } = useKaraokeStore.getState();
      graphRef.current.setVocals(vocalsEnabled, vocalsVolume);
      const { context } = getAudioRuntime();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch (error) { console.error('Audio routing failed:', error); }
  }, []);

  // ---- helpers that read store at call-time (no stale closures) ----

  const stopTimeUpdates = useCallback(() => {
    cancelAnimationFrame(timeUpdateInterval.current);
    timeUpdateInterval.current = null;
  }, []);

  const startTimeUpdates = useCallback(() => {
    stopTimeUpdates();
    const tick = () => {
      const leader = audioRefs.current['multiplex'];
      if (!leader) return;
      useKaraokeStore.getState().setCurrentSongTime(leader.currentTime);
      timeUpdateInterval.current = requestAnimationFrame(tick);
    };
    timeUpdateInterval.current = requestAnimationFrame(tick);
  }, [stopTimeUpdates]);

  // ---- public API ----

  const togglePlay = useCallback(() => {
    const { stems, isPlaying, setIsPlaying } =
      useKaraokeStore.getState();
    if (!stems) return;

    if (isPlaying) {
      // PAUSE
      Object.values(audioRefs.current).forEach(safePause);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.pauseVideo(); } catch(e) {}
      }
      stopTimeUpdates();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      // Initialize/resume Web Audio synchronously inside the user gesture
      wireWebAudio();
      
      // Must resume AudioContext synchronously inside user gesture for mobile Safari/Chrome
      if (window.__karaokeAudioCtx && window.__karaokeAudioCtx.state === 'suspended') {
        window.__karaokeAudioCtx.resume().catch(e => console.warn("Failed to resume AudioContext", e));
      }

      setIsPlaying(true);
      isPlayingRef.current = true;

      // Always play the audio element synchronously to unlock it on mobile browsers.
      // If YouTube buffers, the buffering callback will pause it temporarily.
      safePlay(audioRefs.current['multiplex']);

      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.playVideo(); } catch(e) {}
      }
      
      startTimeUpdates();
    }
  }, [startTimeUpdates, stopTimeUpdates, wireWebAudio]);

  const advanceSong = useCallback(async action => {
    if (advanceInFlightRef.current) return;
    advanceInFlightRef.current = true;
    try {
      const party = await client.send(action, { expectedCurrentQueueId: useKaraokeStore.getState().partyState?.currentSong?.queueId ?? null });
      useKaraokeStore.getState().setPartyState(party);
    } catch (error) {
      if (error.party?.id === roomId) useKaraokeStore.getState().setPartyState(error.party);
      useKaraokeStore.getState().setToast(error.message);
    } finally { advanceInFlightRef.current = false; }
  }, [client, roomId]);
  const handleNextSong = useCallback(() => advanceSong('next'), [advanceSong]);
  const handlePreviousSong = useCallback(() => advanceSong('previous'), [advanceSong]);

  const handleAlignStart = useCallback(() => {
    const { parsedLyrics, selectedVersionIdx, currentSongTime, setLyricsOffset } =
      useKaraokeStore.getState();
    const lines = selectedLyrics(parsedLyrics, selectedVersionIdx);
    const first = lines.find(line => line.text?.trim());
    if (first) {
      setLyricsOffset(Number((currentSongTime - (first.words?.[0]?.start ?? first.time)).toFixed(2)));
    }
  }, []);

  const handleSeek = useCallback((newTime) => {
    useKaraokeStore.getState().setCurrentSongTime(newTime);
    Object.values(audioRefs.current).forEach(a => { if (a) a.currentTime = newTime; });
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.seekTo(newTime, true); } catch(e) {}
    }
  }, []);

  const handleYouTubeStateChange = useCallback((event) => {
    const { setIsPlaying } = useKaraokeStore.getState();

    if (event.data === 1) {
      // PLAYING
      wireWebAudio();
      
      if (window.__karaokeAudioCtx && window.__karaokeAudioCtx.state === 'suspended') {
        window.__karaokeAudioCtx.resume().catch(() => {});
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (audioRefs.current['multiplex']?.paused) {
        safePlay(audioRefs.current['multiplex']);
      }
      startTimeUpdates();
    } else if (event.data === 2) {
      // PAUSED
      setIsPlaying(false);
      isPlayingRef.current = false;
      stopTimeUpdates();
      if (audioRefs.current['multiplex'] && !audioRefs.current['multiplex'].paused) {
        safePause(audioRefs.current['multiplex']);
      }
    } else if (event.data === 3) {
      // BUFFERING — pause stems to stay in sync
      if (audioRefs.current['multiplex'] && !audioRefs.current['multiplex'].paused) {
        safePause(audioRefs.current['multiplex']);
      }
    }
  }, [startTimeUpdates, stopTimeUpdates, wireWebAudio]);

  // ---- internal effects ----

  // Vocals volume / mute sync
  // Strict audio sync (no longer needed because it's multiplexed in a single file!)
  // However, we DO need to set up the Web Audio API routing for the multiplexed file.
  const stems = useKaraokeStore(s => s.stems);
  const isPlaying = useKaraokeStore(s => s.isPlaying);
  useEffect(() => {
    const audio = audioRefs.current.multiplex;
    // Finish the final sung word; the old duration-minus-one check cut it off.
    audio?.addEventListener('ended', handleNextSong);
    return () => {
      audio?.removeEventListener('ended', handleNextSong);
      stopTimeUpdates();
    };
  }, [stems, handleNextSong, stopTimeUpdates]);
  // Pre-wire on mount if possible, and set up a global fallback unlock listener
  useEffect(() => {
    wireWebAudio();

    const unlockAudio = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!window.__karaokeAudioCtx) {
          window.__karaokeAudioCtx = new AudioContext({ latencyHint: 'interactive' });
        }
        if (window.__karaokeAudioCtx.state === 'suspended') {
          window.__karaokeAudioCtx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      } catch (e) {}
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [stems, wireWebAudio]);

  // Sync vocal settings to the Gain Node instead of the raw audio element
  const vocalsEnabled = useKaraokeStore(s => s.vocalsEnabled);
  const vocalsVolume = useKaraokeStore(s => s.vocalsVolume);
  
  useEffect(() => {
    graphRef.current?.setVocals(vocalsEnabled, vocalsVolume);
  }, [vocalsEnabled, vocalsVolume]);

  useEffect(() => () => {
    stopTimeUpdates();
    Object.values(audioRefs.current).forEach(safePause);
    graphRef.current?.detach();
  }, [stopTimeUpdates]);

  // Prevent display from sleeping while song is playing
  useEffect(() => {
    let wakeLock = null;
    let disposed = false;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isPlaying) {
        try {
          if (wakeLock && !wakeLock.released) return;
          const lock = await navigator.wakeLock.request('screen');
          if (disposed) await lock.release();
          else wakeLock = lock;
        } catch (err) {
          console.warn('Wake Lock request failed:', err.name, err.message);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLock !== null) {
        try {
          await wakeLock.release();
          wakeLock = null;
        } catch (err) {
          console.warn('Wake Lock release failed:', err.name, err.message);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (!disposed && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    if (isPlaying) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      disposed = true;
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  const registerMultiplexAudio = useCallback(element => {
    if (audioRefs.current.multiplex !== element) {
      safePause(audioRefs.current.multiplex);
      graphRef.current?.detach();
    }
    audioRefs.current.multiplex = element;
  }, []);

  return {
    registerMultiplexAudio,
    togglePlay,
    handleNextSong,
    handlePreviousSong,
    handleSeek,
    handleAlignStart,
    handleYouTubeStateChange,
    audioRefs,
    ytPlayerRef,
  };
}
