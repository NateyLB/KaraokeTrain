'use client';
import { useEffect, useRef, useState } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { songSessionKey, waitForSong } from '../lib/songLoading';

function applySavedLyrics(lyrics, source, selectDefault = false) {
  const store = useKaraokeStore.getState();
  const multi = lyrics?.[0]?.lyrics;
  const defaultVersion = multi ? Math.max(0, lyrics.findIndex(version => version.label?.includes('Romanized'))) : 0;
  const selected = selectDefault ? defaultVersion : Math.min(store.selectedVersionIdx, multi ? lyrics.length - 1 : 0);
  const lines = (multi ? lyrics[selected]?.lyrics : lyrics) || [];
  store.setParsedLyrics(lyrics || []);
  store.setSelectedVersionIdx(selected);
  store.setFirstValidTime(lines.find(line => line.text?.trim())?.words?.[0]?.start ?? lines.find(line => line.text?.trim())?.time ?? 0);
  store.setLyricsSource(source === 'qwen_transcription' ? 'Qwen transcription' :
    source?.startsWith('lrclib_qwen_aligned') ? 'LRCLIB + Qwen AI' :
    source === 'lrclib_aligned' ? 'LRCLIB + Whisper AI' :
    source === 'lrclib_aligned_multi' ? 'LRCLIB (Multi-Version) + Whisper AI' :
      source === 'whisper_fallback' ? 'Whisper transcription' : 'No verified lyrics');
}

/** Saved audio streams directly; each queue entry owns one cancellable load. */
export function useSongLoader(roomId) {
  const partyState = useKaraokeStore(state => state.partyState);
  const song = partyState?.id === roomId ? partyState.currentSong : null;
  const session = songSessionKey(song);
  const revision = useRef(null);
  const [failedSession, setFailedSession] = useState(null);
  const retryReady = failedSession === session && song?.jobStatus?.status === 'ready';
  const selectedSong = useRef(song);
  useEffect(() => { selectedSong.current = song; }, [song]);

  useEffect(() => {
    const current = selectedSong.current;
    const controller = new AbortController();
    const store = useKaraokeStore.getState();
    store.resetForNewSong();
    store.setCurrentJobId(current?.jobId || null);
    revision.current = null;
    if (!current) { store.setIsLoading(false); store.setLoadingStatus(''); return; }
    store.setIsLoading(true);
    store.setLoadingStatus('Getting your song ready...');
    const load = async () => {
      try {
        const status = current.jobStatus?.status === 'ready' ? current.jobStatus : await waitForSong(current.jobId, {
          signal: controller.signal,
          onProgress: progress => useKaraokeStore.getState().setLoadingStatus(`Getting your song ready... ${progress}%`),
        });
        controller.signal.throwIfAborted();
        revision.current = status.lyricsRevision;
        applySavedLyrics(status.lyrics, status.lyricsSource, true);
        const active = useKaraokeStore.getState();
        active.setStems({ multiplex: `/api/stems?jobId=${encodeURIComponent(current.jobId)}&stem=multiplex` });
        active.setLoadingStatus('Loading audio...');
      } catch (error) {
        if (controller.signal.aborted) return;
        const active = useKaraokeStore.getState();
        active.setLoadingStatus(`Error: ${error.message}`);
        active.setIsLoading(false);
        setFailedSession(session);
      }
    };
    load();
    return () => controller.abort();
  }, [session, roomId, retryReady]);

  // Same-song cache repairs arrive over SSE without restarting playback.
  useEffect(() => {
    const status = song?.jobStatus;
    const store = useKaraokeStore.getState();
    if (song?.jobId !== store.currentJobId || !store.stems || status?.status !== 'ready' ||
        !status.lyricsRevision || status.lyricsRevision === revision.current) return;
    revision.current = status.lyricsRevision;
    applySavedLyrics(status.lyrics, status.lyricsSource);
  }, [song]);
}
