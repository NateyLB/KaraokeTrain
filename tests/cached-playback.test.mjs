import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createAudioResponse, parseByteRange } from '../lib/audio/httpResponse.js';
import { jobQueue } from '../lib/processing/jobQueue.js';
import { partyPayload } from '../lib/party/payload.js';

const audio = Buffer.from('0123456789');
const fixture = () => ({
  size: audio.length,
  createReadStream: range => Readable.from(range ? audio.subarray(range.start, range.end + 1) : audio),
});

test('saved audio streams on the app origin with its complete length', async () => {
  const response = createAudioResponse(fixture(), null, 'audio/mp4');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '10');
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), '0123456789');
});

test('seeking supports bounded, open-ended, suffix, and oversized-end ranges', async () => {
  for (const [header, contentRange, body] of [
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=8-999', 'bytes 8-9/10', '89'],
    ['bytes=-999', 'bytes 0-9/10', '0123456789'],
  ]) {
    const response = createAudioResponse(fixture(), header, 'audio/mp4');
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), contentRange);
    assert.equal(response.headers.get('content-length'), String(body.length));
    assert.equal(await response.text(), body);
  }
});

test('invalid ranges never open an audio stream', async () => {
  for (const header of ['bytes=10-', 'bytes=8-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4', 'bytes=9007199254740992-']) {
    const response = createAudioResponse({ size: 10, createReadStream() { assert.fail('opened invalid range'); } }, header, 'audio/mp4');
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('content-range'), 'bytes */10');
    await response.text();
  }
  assert.equal(parseByteRange('bytes=0-', 0), null);
});

test('cancelling an audio response closes the underlying storage stream', async () => {
  const stream = new Readable({ read() {} });
  const response = createAudioResponse({ size: 10, createReadStream: () => stream }, null, 'audio/mp4');
  await response.body.cancel();
  await setImmediate();
  assert.equal(stream.destroyed, true);
});

test('storage stream errors propagate instead of successful truncated audio', async () => {
  const stream = new Readable({ read() { this.destroy(new Error('storage read failed')); } });
  const response = createAudioResponse({ size: 10, createReadStream: () => stream }, null, 'audio/mp4');
  await assert.rejects(response.text(), /storage read failed/);
});

test('job status changes notify connected listeners and allow cleanup', () => {
  const id = 'CACHE000001';
  const events = [];
  const unsubscribe = jobQueue.subscribe(jobId => events.push([jobId, jobQueue.get(jobId).status]));
  jobQueue.set(id, { status: 'processing', progress: 0 });
  jobQueue.update(id, { status: 'ready', progress: 100 });
  unsubscribe();
  jobQueue.update(id, { status: 'error' });
  assert.deepEqual(events, [[id, 'processing'], [id, 'ready']]);
});

test('party responses include ready cache status and saved lyrics for immediate loading', () => {
  const id = 'CACHE000002';
  const lyrics = [{ time: 1, text: 'Saved lyrics' }];
  jobQueue.set(id, { status: 'ready', cached: true, lyrics });
  const result = partyPayload({ currentSong: { jobId: id }, queue: [{ jobId: id }, { jobId: 'unknown' }] });
  assert.equal(result.currentSong.jobStatus.status, 'ready');
  assert.equal(result.currentSong.jobStatus.cached, true);
  assert.deepEqual(result.currentSong.jobStatus.lyrics, lyrics);
  assert.equal(result.queue[0].jobStatus.status, 'ready');
  assert.equal(result.queue[0].jobStatus.lyrics, undefined);
  assert.equal(result.queue[1].jobStatus.status, 'pending');
});
