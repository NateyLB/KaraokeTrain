import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runDJ } from '../web/lib/dj_runner.mjs';

function fake(callback) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => child.emit('close', 1);
    queueMicrotask(() => callback(child));
    return child;
  };
}
test('DJ handles missing Python, bad output and timeout without uncaught process errors', async () => {
  await assert.rejects(runDJ({}, { launch: fake(c => c.emit('error', new Error('ENOENT'))) }), /could not start/);
  await assert.rejects(runDJ({}, { launch: fake(c => { c.stdout.write('not JSON'); c.emit('close', 0); }) }), /invalid response/);
  await assert.rejects(runDJ({}, { launch: fake(() => {}), timeoutMs: 10 }), /timed out/);
});
test('DJ preserves the web recommendation response', async () => {
  const data = { message: 'Try these', recommended_queries: ['Artist Song'] };
  assert.deepEqual(await runDJ({}, { launch: fake(c => { c.stdout.write(JSON.stringify(data)); c.emit('close', 0); }) }), data);
});
