import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartyClient } from '../lib/party/PartyClient.js';

test('party client strips unrelated track fields and keeps room identity authoritative', async () => {
  let sent;
  const client = new PartyClient('LTIM', async (_, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: 'LTIM', queue: [] }) };
  });
  await client.addSong({ title: 'Song', artist: 'Artist', albumArt: 'cover', videoId: 'abcdefghijk', secret: 'discard' });
  assert.deepEqual(sent, { action: 'add', id: 'LTIM', song: { title: 'Song', artist: 'Artist', art: 'cover', videoId: 'abcdefghijk' } });
  await client.send('next', { id: 'OTHER', action: 'remove' });
  assert.deepEqual(sent, { id: 'LTIM', action: 'next' });
});

test('party client surfaces server rejection instead of reporting success', async () => {
  const client = new PartyClient('LTIM', async () => ({ ok: false, json: async () => ({ error: 'Queue is full' }) }));
  await assert.rejects(client.addSong({}), /Queue is full/);
});

test('queue conflict errors carry the authoritative room snapshot for immediate refresh', async () => {
  const party = { id: 'LTIM', queue: [{ queueId: 'other-entry' }] };
  const client = new PartyClient('LTIM', async () => ({ ok: false, status: 409, json: async () => ({ error: 'The queue changed', party }) }));
  await assert.rejects(client.send('remove', { index: 0, expectedQueueId: 'old-entry' }), error => {
    assert.equal(error.status, 409);
    assert.equal(error.party, party);
    return true;
  });
});

test('a room request remains bounded by its deadline when a cancellation signal is supplied', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 15000);
    return deadline.signal;
  });
  const client = new PartyClient('LTIM', (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = client.send('next', {}, { signal: new AbortController().signal });
  deadline.abort(new DOMException('The room request timed out', 'TimeoutError'));
  await assert.rejects(pending, { name: 'TimeoutError' });
});

test('queue additions forward room-lifetime cancellation', async () => {
  const lifetime = new AbortController();
  const client = new PartyClient('LTIM', (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const pending = client.addSong({ videoId: 'abcdefghijk' }, { signal: lifetime.signal });
  lifetime.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
