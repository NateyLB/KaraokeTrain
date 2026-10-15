import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { RepairJobs } from '../lib/lyrics/RepairJobs.js';

test('HTTP retries share an in-flight repair and can retrieve its result after disconnect', async () => {
  const jobs = new RepairJobs();
  let resolve, calls = 0;
  jobs.start('song', () => { calls++; return new Promise(done => { resolve = done; }); });
  jobs.start('song', () => { throw new Error('Duplicate work'); });
  await setImmediate();
  assert.equal(calls, 1);
  resolve({ lyrics: ['Saved words'] });
  await setImmediate();
  assert.deepEqual(jobs.status('song').result, { lyrics: ['Saved words'] });
});

test('failed repairs expose bounded errors and can be explicitly retried', async () => {
  const jobs = new RepairJobs();
  jobs.start('song', () => { throw new Error('internal credentials and paths'); });
  await setImmediate();
  assert.equal(jobs.status('song').status, 'error');
  assert.ok(!jobs.status('song').error.includes('credentials'));
  jobs.start('song', () => ({ lyrics: [] }));
  await setImmediate();
  assert.equal(jobs.status('song').status, 'ready');
});
