'use client';
import { useRef, useEffect, useCallback } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

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

  // ---- helpers that read store at call-time (no stale closures) ----

  const startTimeUpdates = useCallback(() => {
    clearInterval(timeUpdateInterval.current);
    timeUpdateInterval.current = setInterval(() => {
      const leader = audioRefs.current['multiplex'];
      if (!leader) return;
      const current = leader.currentTime;
      useKaraokeStore.getState().setCurrentSongTime(current);
      if (leader.duration > 0 && current >= leader.duration - 1) {
        handleNextSong();
      }
    }, 50);
  }, []);

  // ---- public API ----

  const togglePlay = useCallback(() => {
    const { stems, isPlaying, vocalsEnabled, vocalsVolume, setIsPlaying } =
      useKaraokeStore.getState();
    if (!stems) return;

    if (isPlaying) {
      // PAUSE
      Object.values(audioRefs.current).forEach(a => a?.pause());
      if (ytPlayerRef.current) ytPlayerRef.current.pauseVideo();
      clearInterval(timeUpdateInterval.current);
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      // PLAY — apply vocal settings first to the web audio nodes
      if (webAudioNodesRef.current && window.__karaokeAudioCtx) {
        // Must resume AudioContext synchronously inside user gesture for mobile Safari/Chrome
        if (window.__karaokeAudioCtx.state === 'suspended') {
          window.__karaokeAudioCtx.resume();
        }
        const { vocalGain } = webAudioNodesRef.current;
        vocalGain.gain.setTargetAtTime(vocalsEnabled ? vocalsVolume : 0, window.__karaokeAudioCtx.currentTime || 0, 0.05);
      }

      setIsPlaying(true);
      isPlayingRef.current = true;

      // Always play the audio element synchronously to unlock it on mobile browsers.
      // If YouTube buffers, the buffering callback will pause it temporarily.
      if (audioRefs.current['multiplex']) {
        audioRefs.current['multiplex'].play().catch(e => console.error('Play prevented', e));
      }

      if (ytPlayerRef.current) {
        ytPlayerRef.current.playVideo();
      }
      
      startTimeUpdates();
    }
  }, [startTimeUpdates]);

  const handleNextSong = useCallback(async () => {
    Object.values(audioRefs.current).forEach(a => {
      if (a) { a.pause(); a.currentTime = 0; }
    });
    clearInterval(timeUpdateInterval.current);
    useKaraokeStore.getState().resetForNewSong();

    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'next', id: roomId }),
    });
  }, [roomId]);

  const handleAlignStart = useCallback(() => {
    const { parsedLyrics, currentSongTime, setLyricsOffset } =
      useKaraokeStore.getState();
    if (parsedLyrics.length > 0) {
      const first = parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0];
      setLyricsOffset((currentSongTime - first.time).toFixed(2));
    }
  }, []);

  const handleSeek = useCallback((newTime) => {
    useKaraokeStore.getState().setCurrentSongTime(newTime);
    Object.values(audioRefs.current).forEach(a => { if (a) a.currentTime = newTime; });
    if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
  }, []);

  const handleYouTubeStateChange = useCallback((event) => {
    const { setIsPlaying } = useKaraokeStore.getState();

    if (event.data === 1) {
      // PLAYING
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (audioRefs.current['multiplex']?.paused) {
        audioRefs.current['multiplex'].play().catch(e => console.error('Play prevented', e));
      }
      startTimeUpdates();
    } else if (event.data === 2) {
      // PAUSED
      setIsPlaying(false);
      isPlayingRef.current = false;
      clearInterval(timeUpdateInterval.current);
      if (audioRefs.current['multiplex'] && !audioRefs.current['multiplex'].paused) {
        audioRefs.current['multiplex'].pause();
      }
    } else if (event.data === 3) {
      // BUFFERING — pause stems to stay in sync
      if (audioRefs.current['multiplex'] && !audioRefs.current['multiplex'].paused) {
        audioRefs.current['multiplex'].pause();
      }
    }
  }, [startTimeUpdates]);

  // ---- internal effects ----

  // Vocals volume / mute sync
  // Strict audio sync (no longer needed because it's multiplexed in a single file!)
  // However, we DO need to set up the Web Audio API routing for the multiplexed file.
  const stems = useKaraokeStore(s => s.stems);
  const isPlaying = useKaraokeStore(s => s.isPlaying);
  const webAudioNodesRef = useRef(null);

  useEffect(() => {
    const audioEl = audioRefs.current['multiplex'];
    if (!audioEl) return;

    // We must initialize Web Audio only after user interaction, or rely on browser autoplay policies
    // Luckily, the user has to click a song to get here!
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!window.__karaokeAudioCtx) {
        window.__karaokeAudioCtx = new AudioContext();
      }
      const ctx = window.__karaokeAudioCtx;

      // Resume context if suspended (Note: on mobile this might be ignored if not in user gesture,
      // but togglePlay will catch it and resume it properly).
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // If we haven't wired up this specific audio element yet...
      if (!audioEl.__webAudioConnected) {
        audioEl.__webAudioConnected = true;

        const source = ctx.createMediaElementSource(audioEl);
        
        // 1. Split the stereo stream into L (0) and R (1)
        const splitter = ctx.createChannelSplitter(2);
        source.connect(splitter);

        // 2. Create independent volume controls (Gain Nodes)
        const instrGain = ctx.createGain();
        const vocalGain = ctx.createGain();

        // 3. Create a Merger to put them back together. 
        // We want both L and R to play out of BOTH speakers (downmix to mono)
        const merger = ctx.createChannelMerger(2);

        // Route Instrumental (Left Channel, 0) to both L and R outputs
        splitter.connect(instrGain, 0);
        instrGain.connect(merger, 0, 0); // L
        instrGain.connect(merger, 0, 1); // R

        // Route Vocals (Right Channel, 1) to both L and R outputs
        splitter.connect(vocalGain, 1);
        vocalGain.connect(merger, 0, 0); // L
        vocalGain.connect(merger, 0, 1); // R

        // Send to speakers
        merger.connect(ctx.destination);

        webAudioNodesRef.current = { instrGain, vocalGain };
      }
    } catch (e) {
      console.error("Web Audio API failed to initialize:", e);
    }
    
    // Clean up function if we want to disconnect, but we can reuse the connection for the lifetime of the audio element
    return () => {};
  }, [stems]);

  // Sync vocal settings to the Gain Node instead of the raw audio element
  const vocalsEnabled = useKaraokeStore(s => s.vocalsEnabled);
  const vocalsVolume = useKaraokeStore(s => s.vocalsVolume);
  
  useEffect(() => {
    if (webAudioNodesRef.current) {
      const { vocalGain } = webAudioNodesRef.current;
      vocalGain.gain.setTargetAtTime(vocalsEnabled ? vocalsVolume : 0, window.__karaokeAudioCtx.currentTime, 0.05);
    }
  }, [vocalsEnabled, vocalsVolume]);

  return {
    togglePlay,
    handleNextSong,
    handleSeek,
    handleAlignStart,
    handleYouTubeStateChange,
    audioRefs,
    ytPlayerRef,
  };
}
