import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Readable } from 'node:stream';
import { parseByteRange } from '../shared/http-range.mjs';
import { stemHandler } from '../backend/stem-stream.mjs';

test('media ranges accept suffix/open/oversized ends and reject malformed input', () => {
  assert.deepEqual(parseByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(parseByteRange('bytes=3-', 10), { start: 3, end: 9 });
  assert.deepEqual(parseByteRange('bytes=0-1000', 10), { start: 0, end: 9 });
  assert.equal(parseByteRange(null, 10), null);
  for (const range of ['bytes=-0', 'bytes=10-', 'bytes=4-2', 'bytes=0-1,3-4', 'bytes=abc-', 'bytes=-', 'items=0-1']) {
    assert.equal(parseByteRange(range, 10), false, range);
  }
});

test('streaming handles HEAD, range reads and GCS errors without crashing the server', { timeout: 10000 }, async t => {
  let opens = 0, fail = false;
  const bytes = Buffer.from('abcdefghij');
  const bucket = { file() { return {
    async getMetadata() { return [{ size: bytes.length }]; },
    createReadStream({ start = 0, end = 9 }) {
      opens++;
      if (fail) return new Readable({ read() { this.destroy(new Error('Synthetic GCS read failure')); } });
      return Readable.from([bytes.subarray(start, end + 1)]);
    },
  }; } };
  const app = express(); app.get('/stems', stemHandler(bucket));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/stems?jobId=testVideo01&stem=multiplex`;
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(opens, 0);
  const partial = await fetch(url, { headers: { Range: 'bytes=-3' } });
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'hij');
  assert.equal((await fetch(url, { headers: { Range: 'bytes=20-' } })).status, 416);
  assert.equal(opens, 1);
  fail = true;
  await assert.rejects(async () => { const response = await fetch(url); await response.arrayBuffer(); });
  fail = false;
  assert.equal(await (await fetch(url)).text(), 'abcdefghij');
  assert.equal((await fetch(url.replace('stem=multiplex', 'stem=../../secret'))).status, 400);
});
