import express from 'express';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const SAMPLE_RATE = 44100;
export const SEGMENT_FRAMES = 441000;
export const HOP_FRAMES = 396900;
export const MAX_FRAMES = SAMPLE_RATE * 15 * 60;

export function chunkFrames(total, index) {
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_FRAMES ||
      !Number.isSafeInteger(index) || index < 0 || index * HOP_FRAMES >= total) {
    throw Object.assign(new Error('Invalid audio chunk'), { status: 400 });
  }
  return Math.min(HOP_FRAMES, total - index * HOP_FRAMES);
}

export function validatePCM(buffer, frames) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== frames * 8) {
    throw Object.assign(new Error('Incorrect PCM byte count'), { status: 400 });
  }
  let peak = 0;
  for (let i = 0; i < buffer.length; i += 8) {
    const left = buffer.readFloatLE(i), right = buffer.readFloatLE(i + 4);
    if (!Number.isFinite(left) || !Number.isFinite(right)) throw Object.assign(new Error('Non-finite audio sample'), { status: 400 });
    peak = Math.max(peak, Math.abs(left), Math.abs(right), Math.abs(left + right));
  }
  return peak;
}

// Compute the same whole-track mono mean/std normalization used by Demucs.
// Retains at most one partial stereo frame, never a complete song.
export class PCMStatistics extends Transform {
  frames = 0;
  mean = 0;
  m2 = 0;
  remainder = Buffer.alloc(0);
  _transform(data, _, callback) {
    try {
      const bytes = Buffer.concat([this.remainder, data]);
      const end = bytes.length - bytes.length % 8;
      for (let i = 0; i < end; i += 8) {
        const left = bytes.readFloatLE(i);
        const right = bytes.readFloatLE(i + 4);
        if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('Invalid source audio');
        if (++this.frames > MAX_FRAMES) throw new Error('Songs must be no longer than 15 minutes');
        const mono = (left + right) / 2;
        const delta = mono - this.mean;
        this.mean += delta / this.frames;
        this.m2 += delta * (mono - this.mean);
      }
      this.remainder = Buffer.from(bytes.subarray(end));
      callback(null, data);
    } catch (error) { callback(error); }
  }
  _flush(callback) {
    callback(this.remainder.length || this.frames < 2 ? new Error('Empty or truncated source audio') : null);
  }
  get std() { return Math.sqrt(this.m2 / (this.frames - 1)) + 1e-8; }
}

function child(command, args, signal, stdio = ['pipe', 'pipe', 'pipe']) {
  const process = spawn(command, args, { signal, stdio });
  let stderr = '';
  process.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
  const done = new Promise((resolve, reject) => {
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve() :
      reject(new Error(`${command} failed (${code}): ${stderr}`)));
  });
  // Attach immediately: the caller will await it along with all pipes.
  done.catch(() => {});
  return { process, done };
}

export function nativeSeparationRouter(bucket, browser, { downloadSource } = {}) {
  const router = express.Router();
  const jobs = new Map();
  const liveVideos = new Map();
  const release = job => {
    if (liveVideos.get(job.videoId) === job.id) liveVideos.delete(job.videoId);
  };
  const object = (job, name) => bucket.file(`nativeSeparation/${job.id}/${name}`);
  const view = job => ({
    id: job.id, status: job.status, error: job.error,
    totalFrames: job.totalFrames, mean: job.mean, std: job.std,
    sampleRate: SAMPLE_RATE, segmentFrames: SEGMENT_FRAMES, hopFrames: HOP_FRAMES,
  });
  const cleanup = async job => {
    // Only this randomly generated job's staging objects; never processedSongs.
    const [files] = await bucket.getFiles({ prefix: `nativeSeparation/${job.id}/` });
    await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  };
  const fail = (job, error) => {
    if (job.status !== 'cancelled') {
      job.status = 'error';
      job.error = error.message;
    }
    job.abort.abort();
    release(job);
    cleanup(job).catch(console.error);
  };
  const settle = async (job, operations) => {
    try { await Promise.all(operations); }
    catch (error) {
      job.abort.abort();
      // A failed pipe must stop/reap every sibling before staging cleanup.
      await Promise.allSettled(operations);
      throw error;
    }
  };
  const prepare = async job => {
    const signal = job.abort.signal;
    const download = downloadSource ? downloadSource(job, signal) : child('yt-dlp', [
      '-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '--max-filesize', '50m',
      '--js-runtimes', 'node', '--remote-components', 'ejs:github',
      '--cookies-from-browser', browser, '-o', '-',
      `https://www.youtube.com/watch?v=${job.videoId}`,
    ], signal);
    const decode = child('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-vn', '-ar', String(SAMPLE_RATE), '-ac', '2', '-f', 'f32le', 'pipe:1',
    ], signal);
    const stats = new PCMStatistics();
    await settle(job, [
      download.done, decode.done,
      pipeline(download.process.stdout, decode.process.stdin, { signal }),
      pipeline(decode.process.stdout, stats, object(job, 'input.f32').createWriteStream({
        resumable: false, metadata: { contentType: 'application/octet-stream' },
      }), { signal }),
    ]);
    job.totalFrames = stats.frames;
    job.mean = stats.mean;
    job.std = stats.std;
    job.status = 'ready';
  };

  router.use(express.json({ limit: '8kb' }));
  router.post('/', async (req, res) => {
    const { videoId, title, artist } = req.body || {};
    if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId) ||
        typeof title !== 'string' || typeof artist !== 'string' ||
        title.length > 500 || artist.length > 500) {
      return res.status(400).json({ error: 'Invalid song' });
    }
    const [[cached], [metadataExists]] = await Promise.all([
      bucket.file(`processedSongs/${videoId}/multiplex.m4a`).exists(),
      bucket.file(`processedSongs/${videoId}/metadata.json`).exists(),
    ]);
    if (cached && metadataExists) return res.json({ cached: true });
    if (cached) return res.status(409).json({ error: 'Cached audio is missing metadata. Repair this entry on the server before retrying.' });
    if (liveVideos.has(videoId) || liveVideos.size >= 2) {
      return res.status(409).json({ error: 'A native job is already running. Retry shortly.' });
    }
    const job = {
      id: crypto.randomUUID(), videoId, title, artist, status: 'preparing',
      abort: new AbortController(), chunks: [], touched: Date.now(), busy: false,
    };
    jobs.set(job.id, job);
    liveVideos.set(videoId, job.id);
    job.work = (async () => {
      // Record generations before processing. Retry can repair a partial publish,
      // but cannot silently overwrite an object changed by another writer.
      job.generations = {};
      for (const name of ['multiplex.m4a', 'vocals.wav', 'no_vocals.wav', 'metadata.json']) {
        try {
          const [metadata] = await bucket.file(`processedSongs/${videoId}/${name}`).getMetadata();
          job.generations[name] = metadata.generation;
        } catch (error) {
          if (Number(error.code) !== 404) throw error;
          job.generations[name] = 0;
        }
      }
      if (job.generations['multiplex.m4a'] !== 0) throw new Error('Another host published this song. Retry to use its cache.');
      await prepare(job);
    })().catch(error => fail(job, error));
    res.status(202).json(view(job));
  });

  router.param('id', (req, res, next, id) => {
    const job = jobs.get(id);
    if (!job) return res.status(404).json({ error: 'Processing session expired. Please retry.' });
    job.touched = Date.now();
    req.nativeJob = job;
    next();
  });
  router.get('/:id', (req, res) => res.json(view(req.nativeJob)));
  router.delete('/:id', async (req, res) => {
    const job = req.nativeJob;
    // Publishing is a short, non-interruptible commit. A lost response can be
    // recovered by checking the cache; cancellation never deletes published audio.
    if (job.status === 'publishing') return res.status(409).json({ error: 'Upload is committing' });
    job.abort.abort();
    job.status = 'cancelled';
    release(job);
    await Promise.allSettled([job.work, job.upload]);
    await cleanup(job);
    res.sendStatus(204);
  });
  router.get('/:id/input/:index', async (req, res) => {
    const job = req.nativeJob;
    if (job.status !== 'ready') return res.status(409).json({ error: 'Source is not ready' });
    const index = Number(req.params.index);
    chunkFrames(job.totalFrames, index);
    const start = index * HOP_FRAMES * 8;
    const frames = Math.min(SEGMENT_FRAMES, job.totalFrames - index * HOP_FRAMES);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Length': String(frames * 8) });
    await pipeline(object(job, 'input.f32').createReadStream({
      start, end: start + frames * 8 - 1,
    }), res);
  });
  router.put('/:id/chunks/:index', express.raw({ type: 'application/octet-stream', limit: HOP_FRAMES * 8 }), async (req, res) => {
    const job = req.nativeJob;
    if (job.status !== 'ready' || job.busy) return res.status(409).json({ error: 'Job is busy' });
    const index = Number(req.params.index);
    const peak = validatePCM(req.body, chunkFrames(job.totalFrames, index));
    const hash = crypto.createHash('sha256').update(req.body).digest('hex');
    if (index < job.chunks.length && job.chunks[index] === hash) return res.sendStatus(204);
    if (index !== job.chunks.length) return res.status(409).json({ error: 'Chunk missing or changed' });
    job.busy = true;
    try {
      job.upload = object(job, `chunk-${index}.f32`).save(req.body, { resumable: false });
      await job.upload;
      if (job.abort.signal.aborted) return res.status(409).json({ error: 'Job cancelled' });
      job.chunks.push(hash);
      job.peak = Math.max(job.peak || 0, peak);
      res.sendStatus(204);
    } finally { job.busy = false; }
  });

  const finalize = async job => {
    const signal = job.abort.signal;
    async function* chunks() {
      for (let i = 0; i < job.chunks.length; i++) {
        yield* object(job, `chunk-${i}.f32`).createReadStream();
      }
    }
    // Two mono signals carried as stereo: L=instrumental, R=vocals.
    // Fragmented M4A works without a seekable output file.
    // One shared gain preserves the relative stem levels while avoiding PCM
    // clipping, including when both stems are mixed at full volume.
    const gain = Math.min(1, 0.98 / Math.max(job.peak || 0, 1e-8));
    const encode = child('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SAMPLE_RATE),
      '-ac', '2', '-i', 'pipe:0',
      '-filter_complex', `[0:a]volume=${gain}:precision=float,asplit=3[mux][inst][voc];[inst]pan=mono|c0=c0[instrumental];[voc]pan=mono|c0=c1[vocals]`,
      '-map', '[mux]', '-c:a', 'aac', '-b:a', '256k', '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4', 'pipe:1',
      '-map', '[instrumental]', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:3',
      '-map', '[vocals]', '-c:a', 'pcm_s16le', '-f', 'wav', 'pipe:4',
    ], signal, ['pipe', 'pipe', 'pipe', 'pipe', 'pipe']);
    const names = ['multiplex.m4a', 'no_vocals.wav', 'vocals.wav'];
    await settle(job, [
      encode.done,
      pipeline(Readable.from(chunks()), encode.process.stdin, { signal }),
      ...[encode.process.stdout, encode.process.stdio[3], encode.process.stdio[4]].map((stream, i) =>
        pipeline(stream, object(job, names[i]).createWriteStream({
          resumable: false,
          metadata: { contentType: i === 0 ? 'audio/mp4' : 'audio/wav' },
        }), { signal })),
    ]);
    job.status = 'publishing';
    // Never overwrite another host's completed cache. Multiplex is the commit marker.
    const publish = async name => {
      await object(job, name).copy(bucket.file(`processedSongs/${job.videoId}/${name}`), {
        preconditionOpts: { ifGenerationMatch: job.generations[name] },
      });
    };
    await publish('no_vocals.wav');
    await publish('vocals.wav');
    const metadata = { title: job.title, artist: job.artist, source: 'native_coreml',
      lyrics: null, nativeSeparation: { sampleRate: SAMPLE_RATE, totalFrames: job.totalFrames, gain,
        model: 'HTDemucs_CoreML', output: 'instrumental-left_vocals-right' } };
    await bucket.file(`processedSongs/${job.videoId}/metadata.json`).save(JSON.stringify(metadata), {
      resumable: false, contentType: 'application/json',
      preconditionOpts: { ifGenerationMatch: job.generations['metadata.json'] },
    });
    await publish('multiplex.m4a');
    job.status = 'complete';
    release(job);
    await cleanup(job).catch(console.error);
  };
  router.post('/:id/finish', (req, res) => {
    const job = req.nativeJob;
    if (['encoding', 'publishing', 'complete'].includes(job.status)) return res.json(view(job));
    if (job.status !== 'ready' || job.busy ||
        job.chunks.length !== Math.ceil(job.totalFrames / HOP_FRAMES)) {
      return res.status(409).json({ error: 'Not all audio chunks have been uploaded' });
    }
    job.status = 'encoding';
    job.work = finalize(job).catch(error => fail(job, error));
    res.status(202).json(view(job));
  });
  const timer = setInterval(() => {
    for (const [id, job] of jobs) {
      if (Date.now() - job.touched > 30 * 60 * 1000 && job.status !== 'publishing') {
        job.abort.abort();
        job.status = 'cancelled';
        jobs.delete(id);
        release(job);
        Promise.allSettled([job.work, job.upload]).then(() => cleanup(job)).catch(console.error);
      }
    }
  }, 60000);
  timer.unref();
  router.use((error, req, res, next) => {
    console.error('[native separation]', error.message);
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: error.message });
  });
  return router;
}
