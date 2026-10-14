export function songSessionKey(song) {
  return song ? song.queueId || `${song.jobId}:${song.addedAt || 0}` : null;
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    function done() { signal?.removeEventListener('abort', aborted); resolve(); }
    function aborted() { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(signal.reason); }
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

/** Poll sequentially so slow requests never overlap; abort on song/room changes. */
export async function waitForSong(jobId, { signal, request = fetch, onProgress, pollMs = 2000, timeoutMs = 20 * 60 * 1000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    signal?.throwIfAborted();
    const response = await request(`/api/separate/status?jobId=${encodeURIComponent(jobId)}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Song status is unavailable. Please try again.');
    if (data.status === 'error') throw new Error(data.error || 'Song processing failed.');
    if (data.status === 'ready' || data.status === 'done') return data;
    onProgress?.(data.progress || 0);
    await delay(pollMs, signal);
  }
  throw new Error('Song processing took too long. Please try another song.');
}
