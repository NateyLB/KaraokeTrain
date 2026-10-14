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
