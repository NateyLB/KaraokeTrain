import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { nativeSeparationRouter, PCMStatistics, validatePCM, chunkFrames, HOP_FRAMES, MAX_FRAMES } from './native-separation.js';

function pcm(frames) {
  const bytes = Buffer.alloc(frames * 8);
  for (let i = 0; i < frames; i++) {
    bytes.writeFloatLE(Math.sin(i * 0.1) * 0.2, i * 8);
    bytes.writeFloatLE(Math.cos(i * 0.1) * 0.1, i * 8 + 4);
  }
  return bytes;
}

test('chunk boundaries preserve every frame, including partial tails', () => {
  for (const total of [2, HOP_FRAMES - 1, HOP_FRAMES, HOP_FRAMES + 1, MAX_FRAMES]) {
    let sum = 0;
    for (let i = 0; i < Math.ceil(total / HOP_FRAMES); i++) sum += chunkFrames(total, i);
    assert.equal(sum, total);
    assert.throws(() => chunkFrames(total, Math.ceil(total / HOP_FRAMES)));
  }
  for (const invalid of [-1, 0, NaN, Infinity, MAX_FRAMES + 1]) assert.throws(() => chunkFrames(invalid, 0));
  assert.throws(() => chunkFrames(100, 0.5));
});

test('uploaded PCM rejects truncation and non-finite samples', () => {
  validatePCM(pcm(20), 20);
  assert.throws(() => validatePCM(pcm(20), 21));
  const invalid = pcm(20); invalid.writeFloatLE(NaN, 0);
  assert.throws(() => validatePCM(invalid, 20));
  invalid.writeFloatLE(Infinity, 0);
  assert.throws(() => validatePCM(invalid, 20));
  const fullScale = Buffer.alloc(8); fullScale.writeFloatLE(1, 0); fullScale.writeFloatLE(1, 4);
  assert.equal(validatePCM(fullScale, 1), 2); // Include the final vocal+instrumental mix peak.
});

test('streaming normalization is accurate across unaligned network chunks', async () => {
  const input = pcm(1000), stats = new PCMStatistics();
  const pieces = [];
  for (let i = 0; i < input.length; i += 13) pieces.push(input.subarray(i, i + 13));
  await pipeline(Readable.from(pieces), stats, new Writable({ write(_, __, done) { done(); } }));
  const mono = Array.from({ length: 1000 }, (_, i) => (input.readFloatLE(i * 8) + input.readFloatLE(i * 8 + 4)) / 2);
  const mean = mono.reduce((sum, n) => sum + n, 0) / mono.length;
  const std = Math.sqrt(mono.reduce((sum, n) => sum + (n - mean) ** 2, 0) / 999) + 1e-8;
  assert.equal(stats.frames, 1000);
  assert.ok(Math.abs(stats.mean - mean) < 1e-12);
  assert.ok(Math.abs(stats.std - std) < 1e-12);
  await assert.rejects(pipeline(Readable.from([Buffer.alloc(9)]), new PCMStatistics(), new Writable({ write(_, __, done) { done(); } })));
});

// GCS emulator: validates object names/preconditions; never touches live GCS.
class MemoryBucket {
  objects = new Map();
  generations = new Map();
  writes = [];
  file(name) {
    const bucket = this;
    return {
      name,
      async exists() { return [bucket.objects.has(name)]; },
      async getMetadata() {
        if (!bucket.objects.has(name)) throw Object.assign(new Error('Not found'), { code: 404 });
        return [{ generation: bucket.generations.get(name) }];
      },
      async save(data, options) {
        const match = options?.preconditionOpts?.ifGenerationMatch;
        if (match !== undefined && match !== (bucket.generations.get(name) ?? 0)) throw Object.assign(new Error('Generation mismatch'), { code: 412 });
        bucket.objects.set(name, Buffer.from(data)); bucket.writes.push(name);
        bucket.generations.set(name, (bucket.generations.get(name) ?? 0) + 1);
      },
      createWriteStream() {
        const parts = [];
        return new Writable({ write(data, _, next) { parts.push(Buffer.from(data)); next(); },
          final(done) { bucket.objects.set(name, Buffer.concat(parts)); bucket.writes.push(name); bucket.generations.set(name, (bucket.generations.get(name) ?? 0) + 1); done(); } });
      },
      createReadStream({ start = 0, end } = {}) {
        assert.ok(bucket.objects.has(name), `Missing ${name}`);
        return Readable.from([bucket.objects.get(name).subarray(start, end === undefined ? undefined : end + 1)]);
      },
      async copy(destination, options) { await destination.save(bucket.objects.get(name), options); },
      async delete() { bucket.objects.delete(name); bucket.generations.delete(name); },
    };
  }
  async getFiles({ prefix }) { return [[...this.objects.keys()].filter(name => name.startsWith(prefix)).map(name => this.file(name))]; }
}

async function until(get, status) {
  for (let i = 0; i < 500; i++) {
    const job = await get();
    if (job.status === status) return job;
    assert.notEqual(job.status, 'error', job.error);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${status}`);
}

test('native protocol: prepare, range, retries, malformed chunks, encode, publish, cache, cleanup', { timeout: 30000 }, async t => {
  const bucket = new MemoryBucket();
  // A previous interrupted publication must be repaired, not mixed with new stems.
  for (const name of ['vocals.wav', 'no_vocals.wav', 'metadata.json']) {
    await bucket.file(`processedSongs/testVideo01/${name}`).save(Buffer.from('incomplete prior upload'));
  }
  const frames = 44100;
  const input = pcm(frames);
  const app = express();
  app.use('/native/jobs', nativeSeparationRouter(bucket, 'unused', {
    downloadSource() {
      // A synthesized WAV source through real ffmpeg. No YouTube, cloud, or song files.
      const process = spawn('ffmpeg', ['-v', 'error', '-f', 'f32le', '-ar', '44100', '-ac', '2', '-i', 'pipe:0', '-f', 'wav', 'pipe:1']);
      process.stdin.end(input);
      const done = new Promise((resolve, reject) => {
        process.on('error', reject);
        process.on('close', code => code === 0 ? resolve() : reject(new Error('Synthetic source failed')));
      });
      return { process, done };
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/native/jobs`;
  const create = () => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: 'testVideo01', title: 'Synthetic test', artist: 'Test' }) });
  const response = await create(); assert.equal(response.status, 202);
  const { id } = await response.json();
  const jobURL = `${base}/${id}`;
  assert.equal((await create()).status, 409);
  const job = await until(async () => (await fetch(jobURL)).json(), 'ready');
  assert.equal(job.totalFrames, frames);
  assert.equal((await fetch(`${jobURL}/input/0`)).headers.get('content-length'), String(frames * 8));
  assert.equal((await fetch(`${jobURL}/input/-1`)).status, 400);
  assert.equal((await fetch(`${jobURL}/finish`, { method: 'POST' })).status, 409);
  const upload = body => fetch(`${jobURL}/chunks/0`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body });
  assert.equal((await upload(Buffer.alloc(8))).status, 400);
  assert.equal((await upload(input)).status, 204);
  assert.equal((await upload(input)).status, 204);
  const changed = Buffer.from(input); changed.writeFloatLE(0.99, 0);
  assert.equal((await upload(changed)).status, 409);
  assert.equal((await fetch(`${jobURL}/finish`, { method: 'POST' })).status, 202);
  await until(async () => (await fetch(jobURL)).json(), 'complete');
  const prefix = 'processedSongs/testVideo01/';
  assert.ok(bucket.objects.get(prefix + 'multiplex.m4a').length > 100);
  assert.equal(bucket.objects.get(prefix + 'vocals.wav').toString('ascii', 0, 4), 'RIFF');
  assert.equal(JSON.parse(bucket.objects.get(prefix + 'metadata.json')).nativeSeparation.totalFrames, frames);
  assert.equal(bucket.writes.filter(name => name.startsWith(prefix)).at(-1), prefix + 'multiplex.m4a');
  assert.equal([...bucket.objects.keys()].filter(name => name.startsWith('nativeSeparation/')).length, 0);
  assert.equal((await (await create()).json()).cached, true);
  // Completed cancellation cannot delete the published catalog.
  assert.equal((await fetch(jobURL, { method: 'DELETE' })).status, 204);
  assert.equal(bucket.objects.size, 4);
});

for (const mode of ['cancel', 'invalid source']) {
  test(`native protocol cleans staging on ${mode}`, { timeout: 15000 }, async t => {
    const bucket = new MemoryBucket();
    const app = express();
    app.use('/jobs', nativeSeparationRouter(bucket, 'unused', {
      downloadSource() {
        return { process: { stdout: mode === 'cancel' ? new Readable({ read() {} }) : Readable.from([Buffer.from('not audio')]) }, done: Promise.resolve() };
      },
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/jobs`;
    const created = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'testVideo02', title: 'Failure test', artist: 'Test' }) });
    const { id } = await created.json();
    if (mode === 'cancel') {
      assert.equal((await fetch(`${base}/${id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await (await fetch(`${base}/${id}`)).json()).status, 'cancelled');
    } else {
      const failed = await until(async () => (await fetch(`${base}/${id}`)).json(), 'error');
      assert.ok(failed.error);
    }
    // No completed song can be published from failed/cancelled source audio.
    assert.equal(bucket.objects.size, 0);
  });
}
