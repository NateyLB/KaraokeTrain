import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../lib/processing/processRunner.js';

test('process runner reports missing commands, nonzero exits and bounded output', async () => {
  await assert.rejects(runProcess('/nonexistent-karaoke-command', []), /ENOENT/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("failure");process.exit(2)']), /code 2: failure/);
  const { stdout } = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(1000))'], { maxOutput: 30 });
  assert.equal(stdout, 'x'.repeat(30));
});

test('timed-out subprocesses terminate before their slot is released', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 50 }), /timed out/);
});
