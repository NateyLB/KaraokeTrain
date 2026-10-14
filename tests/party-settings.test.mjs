import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatedSettings, selectSyncedSettings } from '../lib/party/settings.js';
import { partyStore } from '../lib/party/partyStore.js';

test('only known settings with bounded numeric and boolean values are accepted', () => {
  assert.deepEqual(validatedSettings({ isPlaying: true, vocalsVolume: 0.5, unexpected: 'discard' }), { isPlaying: true, vocalsVolume: 0.5 });
  for (const value of [null, [], 'settings', { isPlaying: 'false' }, { vocalsVolume: 5 }, { lyricsOffset: NaN }, { firstValidTime: -1 }]) {
    assert.throws(() => validatedSettings(value), TypeError);
  }
  assert.equal(selectSyncedSettings({ echoOn: true }).echoOn, true);
  assert.equal(selectSyncedSettings({ currentSongTime: 12 }).currentSongTime, undefined);
});

test('party commands and setting timestamps are strictly ordered even in one millisecond', () => {
  const id = 'TEST';
  const first = partyStore.setRemoteCommand(id, 'next').remoteCommand.timestamp;
  const second = partyStore.setRemoteCommand(id, 'next').remoteCommand.timestamp;
  assert.ok(second > first);
  const timestamp = partyStore.updateSettings(id, { vocalsVolume: 0.5 }, 'host').settings.timestamp;
  assert.ok(partyStore.updateSettings(id, { vocalsVolume: 0.6 }, 'remote').settings.timestamp > timestamp);
  global.karaokeParties.delete(id);
});

test('queue capacity is enforced synchronously at the mutation boundary', () => {
  const id = 'CAPA';
  for (let index = 0; index < 20; index++) partyStore.addSong(id, { jobId: String(index) });
  assert.throws(() => partyStore.addSong(id, { jobId: 'overflow' }), { status: 429 });
  global.karaokeParties.delete(id);
});

test('playing a queued song retains the previous selection for the Back control', () => {
  const id = 'HIST';
  partyStore.addSong(id, { jobId: 'first' });
  partyStore.nextSong(id);
  partyStore.addSong(id, { jobId: 'second' });
  assert.equal(partyStore.playNow(id, 0).currentSong.jobId, 'second');
  assert.equal(partyStore.previousSong(id).currentSong.jobId, 'first');
  global.karaokeParties.delete(id);
});
