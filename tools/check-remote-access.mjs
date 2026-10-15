import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { AccessStore, csrfFor } from '../lib/access/AccessStore.js';
import { checkCache } from '../lib/storage/index.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'karaoke-live-access-'));
const stateFile = path.join(directory, 'state.json'), store = new AccessStore(stateFile);
const origin = 'https://app.karaoketrain.com', base = 'http://127.0.0.1:3191';
const log = fs.openSync(path.join(directory, 'server.log'), 'w', 0o600);
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3191'], {
  env: { ...process.env, NODE_ENV: 'production', ACCESS_MODE: 'paired', PUBLIC_ORIGIN: origin,
    ACCESS_STATE_PATH: stateFile, KARAOKE_BUILD_DIR: '.next-production' },
  stdio: ['ignore', log, log],
});
async function request(route, { token, cookie, csrf, method = 'GET', body, headers = {} } = {}) {
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = `__Host-kt_device=${cookie}`;
  if (csrf) headers['X-Karaoke-CSRF'] = csrf;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
}
async function json(route, options) {
  const response = await request(route, options);
  const data = await response.json();
  return { response, data };
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error('The isolated production server exited.');
    try { if ((await request('/api/health')).ok) { ready = true; break; } } catch {}
    await delay(200);
  }
  assert.ok(ready, 'Production server readiness');
  const protectedRoutes = ['/api/catalog', '/api/search?q=test', '/api/room', '/api/stems', '/api/party?id=SAFE', '/api/party/stream?id=SAFE', '/api/separate/status', '/api/access/manage', '/api/lyrics/sync'];
  for (const route of protectedRoutes) {
    const response = await request(route); assert.equal(response.status, 401, route); await response.body?.cancel();
  }
  for (const route of ['/api/party', '/api/separate/start', '/api/lyrics/sync', '/api/dj']) {
    const response = await request(route, { method: 'POST', body: {} }); assert.equal(response.status, 401, route); await response.body?.cancel();
  }
  const grant = store.pairing('Smoke owner', 'owner');
  let result = await json('/api/access/redeem', { method: 'POST', body: { token: grant.token, client: 'native' } });
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  const owner = result.data.deviceToken;
  assert.equal((await json('/api/access/redeem', { method: 'POST', body: { token: grant.token } })).response.status, 410);
  result = await json('/api/party?id=SAFE', { token: owner }); assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get('cache-control'), /no-store/);
  const command = { id: 'SAFE', action: 'updateSettings', settings: { isPlaying: false }, sender: 'host' };
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, body: command })).response.status, 403);
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, csrf: csrfFor(owner), body: command, headers: { Origin: 'https://evil.test' } })).response.status, 403);
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, csrf: csrfFor(owner), body: command, headers: { Origin: origin } })).response.status, 200);
  result = await json('/api/access/manage', { method: 'POST', token: owner, body: { action: 'invite', roomId: 'SAFE' } });
  assert.equal(result.response.status, 200);
  assert.match(result.data.qr, /^data:image\/png;base64,/);
  const invite = new URLSearchParams(new URL(result.data.url).hash.slice(1)).get('token');
  result = await json('/api/access/redeem', { method: 'POST', body: { token: invite, client: 'native' } });
  assert.equal(result.response.status, 200);
  const guest = result.data.deviceToken;
  assert.equal((await json('/api/party?id=SAFE', { token: guest })).response.status, 200);
  assert.equal((await json('/api/party?id=NOPE', { token: guest })).response.status, 403);
  for (const route of ['/api/stems?jobId=otNBdB_u2_I&stem=multiplex', '/api/access/manage', '/api/separate/status?jobId=otNBdB_u2_I']) {
    assert.equal((await request(route, { token: guest })).status, 403, route);
  }
  assert.equal((await json('/api/party', { method: 'POST', token: guest, body: command })).response.status, 403);
  assert.equal((await json('/api/lyrics/sync', { method: 'POST', token: guest, body: { jobId: 'otNBdB_u2_I' } })).response.status, 403);
  const songId = 'otNBdB_u2_I';
  assert.ok(await checkCache(songId), 'The live smoke only admits an already-processed song');
  result = await json(`/api/separate/start?videoId=${songId}`, { token: owner, method: 'POST' });
  assert.equal(result.response.status, 200); assert.equal(result.data.cached, true);
  const audio = await request(`/api/stems?jobId=${songId}&stem=multiplex`, { token: owner, headers: { Range: 'bytes=0-1023' } });
  assert.equal(audio.status, 206); assert.equal((await audio.arrayBuffer()).byteLength, 1024);
  const catalog = await json('/api/catalog', { token: guest });
  assert.equal(catalog.response.status, 200); assert.ok(catalog.data.length >= 103);
  result = await json('/api/party', { token: guest, method: 'POST', body: { id: 'SAFE', action: 'add', song: { videoId: songId, title: 'Cached smoke', artist: 'Test' } } });
  assert.equal(result.response.status, 200); assert.equal(result.data.currentSong.jobId, songId);
  const abort = new AbortController();
  const stream = await fetch(base + '/api/party/stream?id=SAFE', { headers: { Authorization: `Bearer ${guest}` }, signal: abort.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /data:/);
  store.revoke(store.authenticate(guest).id);
  await json('/api/party', { token: owner, method: 'POST', body: command });
  assert.equal((await reader.read()).done, true, 'Revocation closes an existing stream before another snapshot');
  abort.abort();
  assert.equal((await request('/api/catalog', { token: guest })).status, 401);
  console.log(JSON.stringify({ deniedAnonymousRoutes: 13, pairingSingleUse: true, cookieCsrf: true, scopedGuests: true,
    catalogTitles: catalog.data.length, cachedProcessingBypass: true, privateAudioRangeBytes: 1024, streamRevocation: true }));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  fs.closeSync(log);
  fs.rmSync(directory, { recursive: true, force: true });
}
