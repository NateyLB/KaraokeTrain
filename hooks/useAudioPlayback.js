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
  const audioRefs = useRef({ vocals: null, no_vocals: null });
  const ytPlayerRef = useRef(null);
  const timeUpdateInterval = useRef(null);
  const isPlayingRef = useRef(false);

  // ---- helpers that read store at call-time (no stale closures) ----

  const startTimeUpdates = useCallback(() => {
    clearInterval(timeUpdateInterval.current);
    timeUpdateInterval.current = setInterval(() => {
      const leader = audioRefs.current['no_vocals'];
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
      // PLAY — apply vocal settings first
      if (audioRefs.current['vocals']) {
        audioRefs.current['vocals'].muted = !vocalsEnabled;
        audioRefs.current['vocals'].volume = vocalsVolume;
      }

      setIsPlaying(true);
      isPlayingRef.current = true;

      if (ytPlayerRef.current) {
        ytPlayerRef.current.playVideo();
      } else {
        ['vocals', 'no_vocals'].forEach(k => {
          audioRefs.current[k]?.play().catch(e => console.error('Play prevented', e));
        });
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
      ['vocals', 'no_vocals'].forEach(k => {
        if (audioRefs.current[k]?.paused) {
          audioRefs.current[k].play().catch(e => console.error('Play prevented', e));
        }
      });
      startTimeUpdates();
    } else if (event.data === 2) {
      // PAUSED
      setIsPlaying(false);
      isPlayingRef.current = false;
      clearInterval(timeUpdateInterval.current);
      ['vocals', 'no_vocals'].forEach(k => {
        if (audioRefs.current[k] && !audioRefs.current[k].paused) audioRefs.current[k].pause();
      });
    } else if (event.data === 3) {
      // BUFFERING — pause stems to stay in sync
      ['vocals', 'no_vocals'].forEach(k => {
        if (audioRefs.current[k] && !audioRefs.current[k].paused) audioRefs.current[k].pause();
      });
    }
  }, [startTimeUpdates]);

  // ---- internal effects ----

  // Vocals volume / mute sync
  const vocalsEnabled = useKaraokeStore(s => s.vocalsEnabled);
  const vocalsVolume = useKaraokeStore(s => s.vocalsVolume);
  useEffect(() => {
    if (audioRefs.current['vocals']) {
      audioRefs.current['vocals'].muted = !vocalsEnabled;
      audioRefs.current['vocals'].volume = vocalsVolume;
    }
  }, [vocalsEnabled, vocalsVolume]);

  // Strict audio sync (leader/follower drift correction)
  const stems = useKaraokeStore(s => s.stems);
  const isPlaying = useKaraokeStore(s => s.isPlaying);
  useEffect(() => {
    const leader = audioRefs.current['no_vocals'];
    const follower = audioRefs.current['vocals'];
    if (!leader || !follower) return;

    let syncing = false;

    const onTimeUpdate = () => {
      if (syncing) return;
      const diff = leader.currentTime - follower.currentTime;
      const abs = Math.abs(diff);
      if (abs > 0.5) {
        syncing = true;
        follower.currentTime = leader.currentTime;
        follower.playbackRate = 1.0;
        setTimeout(() => { syncing = false; }, 50);
      } else if (abs > 0.1) {
        follower.playbackRate = diff > 0 ? 1.05 : 0.95;
      } else if (follower.playbackRate !== 1.0) {
        follower.playbackRate = 1.0;
      }
    };

    const onWaiting = () => follower.pause();
    const onPlaying = () => { if (isPlaying) follower.play().catch(() => {}); };
    const onPause = () => { if (leader.paused) follower.pause(); };

    leader.addEventListener('timeupdate', onTimeUpdate);
    leader.addEventListener('waiting', onWaiting);
    leader.addEventListener('playing', onPlaying);
    leader.addEventListener('pause', onPause);

    return () => {
      leader.removeEventListener('timeupdate', onTimeUpdate);
      leader.removeEventListener('waiting', onWaiting);
      leader.removeEventListener('playing', onPlaying);
      leader.removeEventListener('pause', onPause);
    };
  }, [stems, isPlaying]);

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
