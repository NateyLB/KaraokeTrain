'use client';
import { useEffect, useRef, useState } from 'react';
import useKaraokeStore from '../../store/useKaraokeStore';

export default function LyricsUnavailable() {
  const jobId = useKaraokeStore(state => state.currentJobId);
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), [jobId]);
  const retry = async () => {
    if (!jobId || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const response = await fetch('/api/lyrics/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }), signal: controller.signal });
      if (!response.ok) throw new Error('Lyrics could not be updated. Please try again later.');
    } catch (error) {
      if (!controller.signal.aborted) useKaraokeStore.getState().setToast(error.message);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
    <p>Verified lyrics are unavailable for this song.</p>
    <button className="btn-secondary" disabled={busy} onClick={retry} style={{ marginTop: '1rem' }}>{busy ? 'Updating lyrics…' : 'Retry lyrics'}</button>
  </div>;
}
