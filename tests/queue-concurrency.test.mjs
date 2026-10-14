import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partyStore } from '../lib/party/partyStore.js';

function room(id, callback) {
  const party = partyStore.get(id);
  const first = { videoId: 'abcdefghijk', jobId: 'abcdefghijk', queueId: 'first' };
  const second = { ...first, queueId: 'second' };
  const third = { ...first, queueId: 'third' };
  party.queue = [first, second, third];
  try { callback(party); } finally { global.karaokeParties.delete(id); }
}

test('a stale remove cannot delete a different instance of the same video after a reorder', () => {
  room('QC01', party => {
    partyStore.reorderSong('QC01', 0, 1, 'first', 'second');
    assert.throws(() => partyStore.removeSong('QC01', 0, 'first'), { status: 409 });
    assert.deepEqual(party.queue.map(song => song.queueId), ['second', 'first', 'third']);
  });
});

test('reordering checks both the moved entry and its destination before mutating', () => {
  room('QC02', party => {
    partyStore.removeSong('QC02', 1, 'second');
    assert.throws(() => partyStore.reorderSong('QC02', 0, 1, 'first', 'second'), { status: 409 });
    assert.deepEqual(party.queue.map(song => song.queueId), ['first', 'third']);
    assert.equal(partyStore.reorderSong('QC02', 0, 1, 'first', 'third').queue[1].queueId, 'first');
  });
});

test('a stale Play Now cannot switch to the new occupant of a queue position', () => {
  room('QC03', party => {
    partyStore.removeSong('QC03', 0, 'first');
    assert.throws(() => partyStore.playNow('QC03', 0, 'first'), { status: 409 });
    assert.equal(party.currentSong, null);
  });
});

test('simultaneous Next requests for one current entry advance only once', () => {
  room('QC04', party => {
    partyStore.nextSong('QC04', null);
    partyStore.nextSong('QC04', 'first');
    assert.throws(() => partyStore.nextSong('QC04', 'first'), { status: 409 });
    assert.equal(party.currentSong.queueId, 'second');
    assert.deepEqual(party.queue.map(song => song.queueId), ['third']);
  });
});

test('Back preserves history and current song when the waiting queue is full', () => {
  room('QC05', party => {
    partyStore.nextSong('QC05');
    partyStore.nextSong('QC05');
    party.queue = Array.from({ length: 20 }, (_, index) => ({ queueId: `queued-${index}` }));
    assert.throws(() => partyStore.previousSong('QC05', 'second'), { status: 429 });
    assert.equal(party.currentSong.queueId, 'second');
    assert.equal(party.history[0].queueId, 'first');
    assert.equal(party.queue.length, 20);
  });
});

test('malformed identities and positions fail validation; legacy integer requests still work', () => {
  room('QC06', party => {
    for (const identity of [null, 12, {}, '', 'x'.repeat(101)]) {
      assert.throws(() => partyStore.removeSong('QC06', 0, identity), { status: 400 });
    }
    assert.throws(() => partyStore.removeSong('QC06', '0', 'first'), { status: 400 });
    assert.throws(() => partyStore.removeSong('QC06', 3), { status: 400 });
    assert.throws(() => partyStore.removeSong('QC06', 3, 'missing'), { status: 409 });
    partyStore.removeSong('QC06', 0);
    assert.equal(party.queue[0].queueId, 'second');
  });
});
