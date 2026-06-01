'use client';
import { useEffect, useRef } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { parseLRC } from '../lib/lyrics';

/**
 * Owns the song-loading pipeline:
 *   - Watches partyState.currentSong for changes
 *   - Polls /api/separate/status until ready
 *   - Downloads stems (or uses prefetched blobs)
 *   - Fetches / aligns lyrics
 *   - Prefetches the next ready song in the queue
 *
 * Reads/writes entirely through the Zustand store.
 */
export function useSongLoader(roomId) {
  const setupJobIdRef = useRef(null);
  const prefetchedBlobs = useRef({});

  const partyState = useKaraokeStore(s => s.partyState);
  const currentJobId = useKaraokeStore(s => s.currentJobId);

  // ---- React to current song changes ----
  useEffect(() => {
    if (!partyState) return;
    const song = partyState.currentSong;

    if (!song) {
      const st = useKaraokeStore.getState();
      st.setIsLoading(false);
      st.setStems(null);
      st.setCurrentJobId(null);
      st.setIsPlaying(false);
      return;
    }

    if (song.jobId === currentJobId) return;
    useKaraokeStore.getState().setCurrentJobId(song.jobId);
    setupRoom(song);
  }, [partyState, currentJobId]);

  // ---- Background Prefetcher ----
  useEffect(() => {
    if (!partyState?.queue) return;
    const readySong = partyState.queue.find(q => q.jobStatus?.status === 'ready');
    if (
      readySong &&
      !prefetchedBlobs.current[readySong.jobId] &&
      !prefetchedBlobs.current[`fetching_${readySong.jobId}`]
    ) {
      prefetchedBlobs.current[`fetching_${readySong.jobId}`] = true;
      console.log(`Prefetching stems for ${readySong.jobId}...`);

      const fetchStem = async (stemName) => {
        const res = await fetch(`/api/stems?jobId=${readySong.jobId}&stem=${stemName}`);
        if (!res.ok) throw new Error(`Failed to download ${stemName}`);
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob) };
      };

      Promise.all([fetchStem('vocals'), fetchStem('no_vocals')])
        .then(([vocalsData, noVocalsData]) => {
          prefetchedBlobs.current[readySong.jobId] = {
            vocals: vocalsData.url,
            no_vocals: noVocalsData.url,
          };
          console.log(`Prefetched ${readySong.jobId} successfully!`);
        })
        .catch(err => {
          console.error('Failed to prefetch song:', err);
          delete prefetchedBlobs.current[`fetching_${readySong.jobId}`];
        });
    }
  }, [partyState?.queue]);

  // ---- Setup Room (song loading pipeline) ----
  async function setupRoom(song) {
    setupJobIdRef.current = song.jobId;
    const st = useKaraokeStore.getState();

    try {
      st.setIsLoading(true);
      st.resetForNewSong();

      let backgroundLyrics = null;
      let backgroundSource = null;

      // 1. Wait for AI Background Pipeline
      st.setLoadingStatus('KaraokeTrain is getting your song ready... 0%');
      await new Promise((resolve, reject) => {
        const checkStatus = async () => {
          if (setupJobIdRef.current !== song.jobId) {
            clearInterval(pollingInterval);
            return;
          }
          try {
            const statusRes = await fetch(`/api/separate/status?jobId=${song.jobId}`);
            const statusData = await statusRes.json();
            if (statusData.status === 'error') {
              clearInterval(pollingInterval);
              reject(new Error(statusData.error || 'Separation failed'));
            } else if (statusData.status === 'ready') {
              clearInterval(pollingInterval);
              backgroundLyrics = statusData.lyrics;
              backgroundSource = statusData.lyricsSource;
              resolve();
            } else if (statusData.status === 'done') {
              clearInterval(pollingInterval);
              resolve();
            } else {
              useKaraokeStore
                .getState()
                .setLoadingStatus(
                  `KaraokeTrain is getting your song ready... ${statusData.progress || 0}%`
                );
            }
          } catch (err) {
            /* network hiccup — keep polling */
          }
        };
        const pollingInterval = setInterval(checkStatus, 2000);
        checkStatus();
      });

      if (setupJobIdRef.current !== song.jobId) return;

      // 2. Fetch Audio Stems
      let vocalsData = null;
      let noVocalsData = null;

      if (prefetchedBlobs.current[song.jobId]) {
        vocalsData = { url: prefetchedBlobs.current[song.jobId].vocals };
        noVocalsData = { url: prefetchedBlobs.current[song.jobId].no_vocals };
      } else {
        useKaraokeStore
          .getState()
          .setLoadingStatus('Downloading high-quality audio stems (this may take a moment)...');
        const fetchStem = async (stemName) => {
          const res = await fetch(`/api/stems?jobId=${song.jobId}&stem=${stemName}`);
          if (!res.ok) throw new Error(`Failed to download ${stemName}`);
          const blob = await res.blob();
          return { url: URL.createObjectURL(blob) };
        };
        [vocalsData, noVocalsData] = await Promise.all([
          fetchStem('vocals'),
          fetchStem('no_vocals'),
        ]);
      }

      if (setupJobIdRef.current !== song.jobId) return;

      const store = useKaraokeStore.getState();
      store.setStems({ vocals: vocalsData.url, no_vocals: noVocalsData.url });

      // 3. Set Lyrics
      if (backgroundLyrics) {
        store.setParsedLyrics(backgroundLyrics);
        store.setFirstValidTime((backgroundLyrics.find(l => l.text.trim().length > 0) || backgroundLyrics[0])?.time || 0);
        store.setLyricsSource(
          backgroundSource === 'lrclib_aligned'
            ? 'LRCLIB + Whisper AI'
            : 'Pure Whisper AI (Fallback)'
        );
      } else {
        loadLyricsFallback(song);
      }

      store.setLoadingStatus('');
      store.setIsLoading(false);
      store.setLyricsOffset(0);
    } catch (err) {
      console.error('Room setup error:', err);
      useKaraokeStore
        .getState()
        .setLoadingStatus('Error: ' + err.message + ' (Please play the next song in queue)');
    }
  }

  // Lyrics fallback — runs in background, doesn't block playback
  async function loadLyricsFallback(song) {
    try {
      const lyricsRes = await fetch(
        `/api/room?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`
      );
      const data = await lyricsRes.json();
      let fetchedLyrics = null;
      if (data.lyrics && data.lyrics.syncedLyrics) {
        fetchedLyrics = parseLRC(data.lyrics.syncedLyrics);
      } else if (data.lyrics && data.lyrics.plainLyrics) {
        const lines = data.lyrics.plainLyrics.split('\n').filter(Boolean);
        fetchedLyrics = lines.map((line, i) => ({ time: i * 3, text: line }));
      }
      const plainText = fetchedLyrics ? fetchedLyrics.map(p => p.text).join('\n') : '';
      const aiRes = await fetch('/api/lyrics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: song.jobId, plainLyrics: plainText }),
      });
      if (setupJobIdRef.current !== song.jobId) return;
      const aiData = await aiRes.json();
      const store = useKaraokeStore.getState();

      if (aiRes.ok && aiData.lyrics) {
        store.setParsedLyrics(aiData.lyrics);
        store.setFirstValidTime((aiData.lyrics.find(l => l.text.trim().length > 0) || aiData.lyrics[0])?.time || 0);
        store.setLyricsSource(
          aiData.source === 'lrclib_aligned'
            ? 'LRCLIB + Whisper AI'
            : 'Pure Whisper AI (Fallback)'
        );
      } else if (fetchedLyrics && fetchedLyrics.some(l => l.time > 0)) {
        store.setParsedLyrics(fetchedLyrics);
        store.setFirstValidTime((fetchedLyrics.find(l => l.text.trim().length > 0) || fetchedLyrics[0])?.time || 0);
        store.setLyricsSource('LRCLIB (Original Sync - Whisper Failed)');
      } else {
        store.setParsedLyrics([]);
        store.setFirstValidTime(0);
        store.setLyricsSource('No Lyrics Found');
      }
    } catch (e) {
      console.error('Auto Whisper fallback failed:', e);
      const store = useKaraokeStore.getState();
      store.setParsedLyrics([]);
      store.setLyricsSource('Error Loading Lyrics');
    }
  }
}
