import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForSong, songSessionKey } from '../lib/songLoading.js';

test('polling advances to ready sequentially and returns saved lyrics', async () => {
  let requests = 0, inFlight = 0;
  const result = await waitForSong('song', { pollMs: 1, request: async () => {
    assert.equal(inFlight++, 0);
    await Promise.resolve();
    inFlight--;
    const status = ++requests === 2 ? 'ready' : 'processing';
    return { ok: true, json: async () => ({ status, lyrics: ['saved'] }) };
  } });
  assert.equal(requests, 2);
  assert.deepEqual(result.lyrics, ['saved']);
});

test('song changes abort pending timers instead of leaving background polling', async () => {
  const controller = new AbortController();
  const waiting = waitForSong('song', { signal: controller.signal, request: async () => {
    controller.abort();
    return { ok: true, json: async () => ({ status: 'processing' }) };
  } });
  await assert.rejects(waiting, { name: 'AbortError' });
});

test('missing jobs and failed jobs are visible errors, not indefinite loading', async () => {
  await assert.rejects(waitForSong('missing', { request: async () => ({ ok: false, json: async () => ({ error: 'Job not found' }) }) }), /Job not found/);
  await assert.rejects(waitForSong('failed', { request: async () => ({ ok: true, json: async () => ({ status: 'error', error: 'worker failed' }) }) }), /worker failed/);
});

test('two queue entries for the same video have separate playback sessions', () => {
  assert.notEqual(songSessionKey({ jobId: 'same', queueId: 'first' }), songSessionKey({ jobId: 'same', queueId: 'second' }));
  assert.notEqual(songSessionKey({ jobId: 'same', addedAt: 1 }), songSessionKey({ jobId: 'same', addedAt: 2 }));
  assert.equal(songSessionKey(null), null);
});
