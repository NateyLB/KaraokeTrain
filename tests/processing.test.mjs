import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TaskScheduler, ProcessingBusyError } from '../lib/processing/TaskScheduler.js';
import { SongProcessingService } from '../lib/processing/SongProcessingService.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('scheduler bounds concurrency, coalesces duplicate work, and releases failed slots', async () => {
  const scheduler = new TaskScheduler({ concurrency: 1, maxPending: 1 });
  const gate = deferred();
  let runs = 0;
  const first = scheduler.submit('first', async () => { runs++; await gate.promise; throw new Error('worker failure'); });
  const rejected = assert.rejects(first, /worker failure/);
  assert.equal(scheduler.submit('first', () => { throw new Error('duplicate'); }), first);
  const next = scheduler.submit('second', () => { runs++; return 'done'; });
  assert.throws(() => scheduler.submit('overflow', () => {}), ProcessingBusyError);
  assert.equal(scheduler.activeCount, 1);
  assert.equal(scheduler.pendingCount, 1);
  gate.resolve();
  await rejected;
  assert.equal(await next, 'done');
  await scheduler.whenIdle();
  assert.equal(runs, 2);
  assert.equal(scheduler.activeCount, 0);
});

test('simultaneous routes check cache and process each video once', async () => {
  const scheduler = new TaskScheduler();
  const gate = deferred();
  let checks = 0, runs = 0;
  const states = new Map();
  const jobs = { set: (id, value) => states.set(id, value), update: (id, value) => states.set(id, { ...states.get(id), ...value }) };
  const service = new SongProcessingService({ scheduler, jobs,
    checkCache: async () => { checks++; await gate.promise; return null; },
    processSong: async song => { runs++; jobs.update(song.videoId, { status: 'ready' }); },
  });
  const first = service.start({ videoId: 'same' });
  assert.equal(service.start({ videoId: 'same' }), first);
  gate.resolve();
  assert.deepEqual(await first, { job_id: 'same', cached: false });
  await scheduler.whenIdle();
  assert.equal(checks, 1);
  assert.equal(runs, 1);
  assert.equal(states.get('same').status, 'ready');
});

test('cached playback bypasses a full processing queue and keeps saved lyrics', async () => {
  const scheduler = new TaskScheduler({ maxPending: 0 });
  const gate = deferred();
  const occupied = scheduler.submit('other', () => gate.promise);
  let ready;
  const service = new SongProcessingService({ scheduler, jobs: { set: (_, data) => { ready = data; } },
    checkCache: async () => ({ lyrics: [{ text: 'saved' }], source: 'qwen_transcription', lyricsRevision: 'r1' }),
    processSong: () => { throw new Error('cached songs must not process'); },
  });
  assert.equal((await service.start({ videoId: 'cached' })).cached, true);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.lyricsRevision, 'r1');
  gate.resolve();
  await occupied;
});

test('a rejected cache lookup can be retried without an abandoned reservation', async () => {
  let attempts = 0;
  const service = new SongProcessingService({ scheduler: new TaskScheduler(), jobs: { set() {} },
    checkCache: async () => { if (++attempts === 1) throw new Error('storage unavailable'); return {}; }, processSong() {},
  });
  await assert.rejects(service.start({ videoId: 'retry' }), /storage unavailable/);
  assert.equal((await service.start({ videoId: 'retry' })).cached, true);
});
