'use client';
import { apiFetch } from '../../lib/access/client';
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
      const response = await apiFetch('/api/lyrics/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }), signal: controller.signal });
      if (!response.ok) throw new Error('Lyrics could not be updated. Please try again later.');
      if (response.status === 202) {
        const deadline = Date.now() + 30 * 60 * 1000;
        let completed = false;
        while (Date.now() < deadline) {
          await new Promise((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(controller.signal.reason); };
            const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, 2000);
            controller.signal.addEventListener('abort', abort, { once: true });
            if (controller.signal.aborted) abort();
          });
          const status = await apiFetch(`/api/lyrics/sync?jobId=${encodeURIComponent(jobId)}`, { signal: controller.signal });
          const state = await status.json();
          if (!status.ok || state.status === 'error') throw new Error(state.error || 'Lyrics could not be updated.');
          if (state.status === 'ready') { completed = true; break; }
        }
        if (!completed) throw new Error('The lyric repair is taking longer than expected.');
      }
    } catch (error) {
      if (!controller.signal.aborted) useKaraokeStore.getState().setToast(error.message);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
    <p>Verified lyrics are unavailable for this song.</p>
    <button className="btn-secondary" disabled={busy} onClick={retry} style={{ marginTop: '1rem' }}>{busy ? 'Updating lyrics…' : 'Retry lyrics'}</button>
  </div>;
}
