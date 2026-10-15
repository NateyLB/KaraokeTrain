import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withMacWorker } from '../lib/processing/macWorker.js';
import { setTimeout as delay } from 'node:timers/promises';

test('Mac audio work serializes, permits nested lyric work, and releases failed operations', { skip: process.platform !== 'darwin' }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'karaoke-worker-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const options = { filename: path.join(directory, 'worker.lock') }, order = [];
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const first = withMacWorker(async () => {
    order.push('song');
    started();
    await withMacWorker(async () => { order.push('lyrics'); await delay(20); }, options);
    order.push('complete');
  }, options);
  await ready;
  await Promise.all([first, withMacWorker(() => { order.push('next'); }, options)]);
  assert.deepEqual(order, ['song', 'lyrics', 'complete', 'next']);
  await assert.rejects(withMacWorker(() => { throw new Error('Worker failure'); }, options), /Worker failure/);
  await withMacWorker(() => { order.push('retry'); }, options);
  assert.equal(order.at(-1), 'retry');
});
