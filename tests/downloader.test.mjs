import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const port = 4051;
const secret = 'downloader-test-secret';
const url = `http://127.0.0.1:${port}/download?videoId=dQw4w9WgXcQ`;

async function withDownloader(script, check, testSecret = secret) {
  const directory = await mkdtemp(path.join(tmpdir(), 'karaoke-downloader-test-'));
  if (script !== null) {
    const executable = path.join(directory, 'yt-dlp');
    await writeFile(executable, `#!/bin/sh\n${script}\n`);
    await chmod(executable, 0o700);
  }
  const child = spawn(process.execPath, ['downloader-api.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: directory, PORT: String(port), DOWNLOADER_SECRET: testSecret },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = once(child, 'exit');
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Downloader did not start: ${output}`)), 5000);
      child.stdout.on('data', () => {
        if (output.includes('Local Downloader API running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Downloader exited: ${output}`)); });
    });
    await check();
    assert.ok(!output.includes(`Bearer ${testSecret}`), 'Authorization header must not be logged');
  } finally {
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}

test('downloader rejects missing authorization and invalid video IDs', async () => {
  await withDownloader('printf audio', async () => {
    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 403);
    await unauthorized.text();
    const invalid = await fetch(`http://127.0.0.1:${port}/download?videoId=invalid`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    assert.equal(invalid.status, 400);
    await invalid.text();
  });
});

test('a missing yt-dlp returns valid HTTP 503 rather than conflicting framing headers', async () => {
  await withDownloader(null, async () => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /unavailable/);
    assert.ok(!(response.headers.has('transfer-encoding') && response.headers.has('content-length')));
  });
});

test('a failed yt-dlp returns HTTP 502 rather than successful empty audio', async () => {
  await withDownloader('exit 1', async () => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(response.status, 502);
    assert.equal(await response.text(), 'Download failed');
  });
});

test('a successful download streams the exact audio bytes', async () => {
  await withDownloader('printf test-audio', async () => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mp4');
    assert.equal(await response.text(), 'test-audio');
  });
});

test('non-ASCII secrets are compared by byte length without throwing', async () => {
  await withDownloader('printf audio', async () => {
    const response = await fetch(url, { headers: { Authorization: 'Bearer a' } });
    assert.equal(response.status, 403);
    await response.text();
  }, 'é');
});
