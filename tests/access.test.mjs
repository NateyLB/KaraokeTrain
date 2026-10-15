import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccessStore, csrfFor } from '../lib/access/AccessStore.js';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'karaoke-access-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = 1000000;
  const store = new AccessStore(path.join(directory, 'state.json'), () => now);
  const owner = store.redeem(store.pairing('Owner phone', 'owner').token);
  return { store, directory, owner, advance: milliseconds => { now += milliseconds; } };
}

test('pairing grants are single-use; only credential hashes persist across restarts', t => {
  const { store, directory, owner } = fixture(t);
  const grant = store.pairing('Television');
  const paired = store.redeem(grant.token);
  assert.equal(paired.principal.role, 'host');
  assert.throws(() => store.redeem(grant.token), { status: 410 });
  const persisted = fs.readFileSync(store.filename, 'utf8');
  for (const secret of [grant.token, owner.token, paired.token]) assert.ok(!persisted.includes(secret));
  assert.equal(new AccessStore(store.filename, () => 1000000).authenticate(paired.token).id, paired.principal.id);
  assert.equal(fs.statSync(store.filename).mode & 0o777, 0o600);
  assert.equal(fs.statSync(directory).mode & 0o077, 0);
});

test('expired pairing cannot issue a device credential', t => {
  const { store, advance } = fixture(t), grant = store.pairing('Phone');
  advance(10 * 60 * 1000 + 1);
  assert.throws(() => store.redeem(grant.token), { status: 410 });
});

test('guests can read and add only in their invited room; host controls and other rooms are denied', t => {
  const { store, owner } = fixture(t), invite = store.invitation(owner.principal, 'ABCD');
  const guest = store.redeem(invite.token), principal = store.authenticate(guest.token);
  assert.equal(principal.role, 'guest');
  assert.equal(store.room(principal, 'ABCD', 'read').host, false);
  assert.equal(store.room(principal, 'ABCD', 'add').host, false);
  assert.throws(() => store.room(principal, 'ABCD', 'control'), { status: 403 });
  assert.throws(() => store.room(principal, 'WXYZ', 'read'), { status: 403 });
  assert.throws(() => store.invitation(principal, 'ABCD'), { status: 403 });
});

test('guest membership expires even when redeemed by a long-lived host device', t => {
  const { store, owner, advance } = fixture(t);
  const host = store.redeem(store.pairing('Other host').token);
  const invite = store.invitation(owner.principal, 'ABCD');
  const joined = store.redeem(invite.token, 'Host', host.token);
  assert.equal(joined.token, host.token);
  assert.equal(store.room(store.authenticate(host.token), 'ABCD').host, false);
  advance(2 * 60 * 60 * 1000 + 1);
  assert.ok(store.authenticate(host.token));
  assert.throws(() => store.room(store.authenticate(host.token), 'ABCD'), { status: 403 });
});

test('revoking a device revokes its invitations and room memberships', t => {
  const { store, owner } = fixture(t);
  const host = store.redeem(store.pairing('Host').token), invite = store.invitation(host.principal, 'ABCD');
  const delegatedPairing = store.pairing('Delegated device', 'host', host.principal.id);
  const guest = store.redeem(invite.token);
  store.revoke(host.principal.id);
  assert.equal(store.authenticate(host.token), null);
  assert.throws(() => store.redeem(invite.token), { status: 410 });
  assert.throws(() => store.redeem(delegatedPairing.token), { status: 410 });
  assert.equal(store.authenticate(guest.token), null);
  assert.ok(store.authenticate(owner.token));
});

test('removing room guest access invalidates both old links and guest credentials', t => {
  const { store, owner } = fixture(t);
  const invitation = store.invitation(owner.principal, 'ABCD'), guest = store.redeem(invitation.token);
  store.revokeGuests(owner.principal, 'ABCD');
  assert.equal(store.authenticate(guest.token), null);
  assert.throws(() => store.redeem(invitation.token), { status: 410 });
  assert.ok(store.room(owner.principal, 'ABCD', 'control').host);
});

test('corrupt state and overlapping writers fail closed instead of resetting credentials', t => {
  const { store, owner } = fixture(t);
  fs.writeFileSync(store.filename + '.lock', 'another writer');
  assert.throws(() => store.pairing('Phone'), { status: 503 });
  assert.ok(store.authenticate(owner.token));
  fs.rmSync(store.filename + '.lock');
  fs.writeFileSync(store.filename, '{broken');
  assert.throws(() => store.authenticate(owner.token), { status: 503 });
});

test('production fails closed, validates cookie CSRF, and accepts scoped bearer credentials', async t => {
  const { directory } = fixture(t), previous = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'production', ACCESS_MODE: 'paired', PUBLIC_ORIGIN: 'https://app.karaoketrain.com', ACCESS_STATE_PATH: path.join(directory, 'http.json') });
  t.after(() => { for (const key of ['NODE_ENV', 'ACCESS_MODE', 'PUBLIC_ORIGIN', 'ACCESS_STATE_PATH']) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  const { withAccess, accessStore, COOKIE, accessEnabled } = await import('../lib/access/server.js?http-regression');
  const paired = accessStore.redeem(accessStore.pairing('Phone').token);
  const handler = withAccess(['host', 'owner'], async () => Response.json({ success: true }));
  const request = headers => new Request('https://app.karaoketrain.com/api/example', { method: 'POST', headers });
  assert.equal((await handler(request({}))).status, 401);
  const cookie = `${COOKIE}=${paired.token}`;
  assert.equal((await handler(request({ cookie }))).status, 403);
  assert.equal((await handler(request({ cookie, origin: 'https://evil.example', 'x-karaoke-csrf': csrfFor(paired.token) }))).status, 403);
  assert.equal((await handler(request({ cookie, origin: process.env.PUBLIC_ORIGIN, 'x-karaoke-csrf': csrfFor(paired.token) }))).status, 200);
  const authorized = await handler(request({ authorization: `Bearer ${paired.token}` }));
  assert.equal(authorized.status, 200);
  assert.match(authorized.headers.get('cache-control'), /no-store/);
  accessStore.revoke(paired.principal.id);
  assert.equal((await handler(request({ authorization: `Bearer ${paired.token}` }))).status, 401);
  delete process.env.ACCESS_MODE;
  assert.throws(accessEnabled, { status: 503 });
});

test('every API route declares an access guard or its explicit public endpoint', () => {
  const publicPaths = new Set(['access/session', 'access/redeem', 'health']);
  for (const filename of fs.readdirSync('app/api', { recursive: true }).filter(file => file.endsWith('route.js'))) {
    const source = fs.readFileSync(path.join('app/api', filename), 'utf8');
    const route = path.dirname(filename);
    assert.ok(publicPaths.has(route) || /export const (?:GET|POST|DELETE) = withAccess\(/.test(source), `Unguarded API: ${route}`);
    assert.ok(!/export async function (?:GET|POST|DELETE)/.test(source) || route === 'health', `Unwrapped API method: ${route}`);
  }
});
