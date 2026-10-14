import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./downloader-api.js', import.meta.url));
function launch(port, secret = 'test-only-not-a-real-secret') {
  const env = { ...process.env, PORT: String(port), KARAOKE_ENV_FILE: entry + '.nonexistent-env', DOWNLOADER_SECRET: secret };
  const child = spawn(process.execPath, [entry], { cwd: tmpdir(), env });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, output }));
  });
  return { child, done, output: () => output };
}

test('backend starts from another cwd; duplicate port exits nonzero without false success', { timeout: 20000 }, async t => {
  const first = launch(0);
  t.after(async () => { first.child.kill('SIGTERM'); await first.done; });
  let port;
  for (let i = 0; i < 150; i++) {
    port = first.output().match(/running on http:\/\/localhost:(\d+)/)?.[1];
    if (port) break;
    if (first.child.exitCode !== null) assert.fail(first.output());
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(port, first.output());
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.service, 'karaoke-downloader');
  const second = launch(port);
  t.after(() => second.child.kill('SIGTERM'));
  const result = await second.done;
  assert.equal(result.code, 1);
  assert.match(result.output, /already in use/);
  assert.doesNotMatch(result.output, /API running/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
});

test('missing secret and malformed port fail clearly', { timeout: 10000 }, async () => {
  const missing = await launch(0, '').done;
  assert.equal(missing.code, 1);
  assert.match(missing.output, /DOWNLOADER_SECRET/);
  const badPort = await launch('not-a-port').done;
  assert.equal(badPort.code, 1);
  assert.match(badPort.output, /PORT must be an integer/);
});
