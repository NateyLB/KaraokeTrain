import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { AccessStore, csrfFor, digest } from '../lib/access/AccessStore.js';
import { checkCache } from '../lib/storage/index.js';

const { values } = parseArgs({ options: { public: { type: 'boolean', default: false } } });
const origin = 'https://app.karaoketrain.com', base = values.public ? origin : 'http://127.0.0.1:3191';
if (values.public && (process.env.ACCESS_MODE !== 'paired' || process.env.PUBLIC_ORIGIN !== origin || !process.env.ACCESS_STATE_PATH)) {
  throw new Error('Public verification requires the configured paired production environment.');
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'karaoke-live-access-'));
const stateFile = values.public ? process.env.ACCESS_STATE_PATH : path.join(directory, 'state.json');
const store = new AccessStore(stateFile), roomId = randomBytes(2).toString('hex').toUpperCase();
const checkName = `Deployment check ${randomBytes(8).toString('hex')}`, grants = [];
const log = values.public ? undefined : fs.openSync(path.join(directory, 'server.log'), 'w', 0o600);
const child = values.public ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3191'], {
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
    if (child && child.exitCode !== null) throw new Error('The isolated production server exited.');
    try { if ((await request('/api/health')).ok) { ready = true; break; } } catch {}
    await delay(200);
  }
  assert.ok(ready, 'Production server readiness');
  const protectedRoutes = ['/api/catalog', '/api/search?q=test', '/api/room', '/api/stems', `/api/party?id=${roomId}`, `/api/party/stream?id=${roomId}`, '/api/separate/status', '/api/access/manage', '/api/lyrics/sync'];
  for (const route of protectedRoutes) {
    const response = await request(route); assert.equal(response.status, 401, route); await response.body?.cancel();
  }
  for (const route of ['/api/party', '/api/separate/start', '/api/lyrics/sync', '/api/dj']) {
    const response = await request(route, { method: 'POST', body: {} }); assert.equal(response.status, 401, route); await response.body?.cancel();
  }
  const grant = store.pairing(`${checkName} owner`, 'owner');
  grants.push(digest(grant.token));
  let result = await json('/api/access/redeem', { method: 'POST', body: { token: grant.token, client: 'native' } });
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  const owner = result.data.deviceToken;
  assert.equal((await json('/api/access/redeem', { method: 'POST', body: { token: grant.token } })).response.status, 410);
  result = await json(`/api/party?id=${roomId}`, { token: owner }); assert.equal(result.response.status, 200);
  assert.equal(store.read().rooms[roomId].ownerId, store.authenticate(owner).id, 'The check must own its temporary room');
  assert.match(result.response.headers.get('cache-control'), /no-store/);
  const command = { id: roomId, action: 'updateSettings', settings: { isPlaying: false }, sender: 'host' };
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, body: command })).response.status, 403);
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, csrf: csrfFor(owner), body: command, headers: { Origin: 'https://evil.test' } })).response.status, 403);
  assert.equal((await json('/api/party', { method: 'POST', cookie: owner, csrf: csrfFor(owner), body: command, headers: { Origin: origin } })).response.status, 200);
  result = await json('/api/access/manage', { method: 'POST', token: owner, body: { action: 'invite', roomId } });
  assert.equal(result.response.status, 200);
  assert.match(result.data.qr, /^data:image\/png;base64,/);
  const invite = new URLSearchParams(new URL(result.data.url).hash.slice(1)).get('token');
  result = await json('/api/access/redeem', { method: 'POST', body: { token: invite, client: 'native', name: `${checkName} guest` } });
  assert.equal(result.response.status, 200);
  const guest = result.data.deviceToken;
  assert.equal((await json(`/api/party?id=${roomId}`, { token: guest })).response.status, 200);
  assert.equal((await json(`/api/party?id=${roomId === 'NOPE' ? 'ELSE' : 'NOPE'}`, { token: guest })).response.status, 403);
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
  result = await json('/api/party', { token: guest, method: 'POST', body: { id: roomId, action: 'add', song: { videoId: songId, title: 'Cached smoke', artist: 'Test' } } });
  assert.equal(result.response.status, 200); assert.equal(result.data.currentSong.jobId, songId);
  const abort = new AbortController();
  const stream = await fetch(base + `/api/party/stream?id=${roomId}`, { headers: { Authorization: `Bearer ${guest}` }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(45000)]) });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  async function nextEvent() {
    for (;;) {
      const boundary = buffered.indexOf('\n\n');
      if (boundary >= 0) {
        const event = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        return event;
      }
      const chunk = await reader.read();
      if (chunk.done) {
        buffered += decoder.decode();
        assert.equal(buffered.trim(), '', 'The stream must finish between complete SSE events');
        return null;
      }
      buffered += decoder.decode(chunk.value, { stream: true });
      assert.ok(buffered.length < 1024 * 1024, 'Bound the buffered SSE event');
    }
  }
  // A proxy can split one SSE event over several transport chunks.
  assert.match(await nextEvent(), /^data:/);
  store.revoke(store.authenticate(guest).id);
  await json('/api/party', { token: owner, method: 'POST', body: command });
  for (let event; (event = await nextEvent()) !== null;) {
    assert.doesNotMatch(event, /^data:/m, 'Revocation closes an existing stream before another snapshot');
  }
  abort.abort();
  assert.equal((await request('/api/catalog', { token: guest })).status, 401);
  console.log(JSON.stringify({ publicHttps: values.public, deniedAnonymousRoutes: 13, pairingSingleUse: true, cookieCsrf: true, scopedGuests: true,
    catalogTitles: catalog.data.length, cachedProcessingBypass: true, privateAudioRangeBytes: 1024, streamRevocation: true }));
} finally {
  if (child) {
    child.kill('SIGTERM');
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
    fs.closeSync(log);
  }
  if (values.public) {
    for (const device of store.devices()) if (device.name.startsWith(`${checkName} `)) store.revoke(device.id);
    store.transaction(data => { for (const key of grants) delete data.grants[key]; });
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
