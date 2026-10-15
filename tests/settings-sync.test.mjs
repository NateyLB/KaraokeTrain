import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import { SettingsSynchronizer } from '../lib/party/SettingsSynchronizer.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(t, send) {
  const store = createStore(() => ({ isPlaying: false, vocalsVolume: 1, micVolume: 1, echoOn: false }));
  const requests = [], errors = [];
  const sync = new SettingsSynchronizer({
    role: 'remote', store, delayMs: 60000,
    client: { send: async (...args) => { requests.push(args); return send(...args); } },
    apply: patch => store.setState(patch), onError: error => errors.push(error.message),
  });
  t.after(() => sync.dispose());
  return { sync, store, requests, errors };
}

test('remote changes arrive during local edits, which send only changed fields without echoes', async t => {
  const f = fixture(t, async (_, { settings }) => ({ settings: { ...settings, isPlaying: true, timestamp: 3 } }));
  f.sync.receive({ timestamp: 1, vocalsVolume: 1, isPlaying: false });
  f.store.setState({ vocalsVolume: 0.5 });
  f.sync.receive({ timestamp: 2, vocalsVolume: 1, isPlaying: true });
  assert.equal(f.store.getState().isPlaying, true, 'A phone play command cannot disappear during a volume edit');
  assert.equal(f.store.getState().vocalsVolume, 0.5);
  await f.sync.flush();
  assert.deepEqual(f.requests[0][1], { sender: 'remote', settings: { vocalsVolume: 0.5 } });
  await f.sync.flush();
  assert.equal(f.requests.length, 1, 'Applying server settings must not send them back');
});

test('settings from another client with the same role apply, and stale snapshots do not roll them back', async t => {
  const f = fixture(t, async () => assert.fail('No local settings changed'));
  f.sync.receive({ timestamp: 0, echoOn: true, lastUpdatedBy: 'remote' });
  assert.equal(f.store.getState().echoOn, true);
  f.sync.receive({ timestamp: 4, echoOn: false, lastUpdatedBy: 'remote' });
  f.sync.receive({ timestamp: 3, echoOn: true });
  f.sync.receive({ timestamp: 4, echoOn: true });
  assert.equal(f.store.getState().echoOn, false);
  await f.sync.flush();
  assert.equal(f.requests.length, 0);
});

test('a newer server snapshot protected during an HTTP request is applied after acknowledgment', async t => {
  const response = deferred();
  const f = fixture(t, () => response.promise);
  f.sync.receive({ timestamp: 1, vocalsVolume: 1 });
  f.store.setState({ vocalsVolume: 0.5 });
  const sending = f.sync.flush();
  f.sync.receive({ timestamp: 3, vocalsVolume: 0.8, isPlaying: true });
  assert.equal(f.store.getState().vocalsVolume, 0.5, 'Preserve the in-flight local edit');
  assert.equal(f.store.getState().isPlaying, true);
  response.resolve({ settings: { timestamp: 2, vocalsVolume: 0.5 } });
  await sending;
  assert.equal(f.store.getState().vocalsVolume, 0.8, 'Do not lose the newer remote edit after HTTP finishes');
});

test('edits made during a request are sent sequentially with their latest values', async t => {
  const first = deferred();
  let calls = 0;
  const f = fixture(t, async (_, { settings }) => ++calls === 1 ? first.promise : { settings: { ...settings, timestamp: 3 } });
  f.store.setState({ vocalsVolume: 0.5 });
  const sending = f.sync.flush();
  f.store.setState({ vocalsVolume: 0.2, micVolume: 0.6 });
  await f.sync.flush();
  assert.equal(f.requests.length, 1);
  first.resolve({ settings: { timestamp: 2, vocalsVolume: 0.5, micVolume: 1 } });
  await sending;
  assert.equal(f.store.getState().vocalsVolume, 0.2);
  assert.equal(f.store.getState().micVolume, 0.6);
  await f.sync.flush();
  assert.deepEqual(f.requests[1][1].settings, { vocalsVolume: 0.2, micVolume: 0.6 });
});

test('failed setting patches report the error and survive for the next interaction', async t => {
  let attempts = 0;
  const f = fixture(t, async (_, { settings }) => {
    if (++attempts === 1) throw new Error('Network unavailable');
    return { settings: { ...settings, timestamp: 2 } };
  });
  f.store.setState({ vocalsVolume: 0.4 });
  await f.sync.flush();
  assert.deepEqual(f.errors, ['Network unavailable']);
  f.sync.receive({ timestamp: 1, vocalsVolume: 1, echoOn: true });
  assert.equal(f.store.getState().vocalsVolume, 0.4);
  f.store.setState({ micVolume: 0.7 });
  await f.sync.flush();
  assert.deepEqual(f.requests[1][1].settings, { vocalsVolume: 0.4, micVolume: 0.7 });
});

test('disposing a room cancels debounce, aborts its request and ignores late responses', async t => {
  const response = deferred();
  const f = fixture(t, () => response.promise);
  f.store.setState({ echoOn: true });
  const sending = f.sync.flush();
  const signal = f.requests[0][2].signal;
  f.sync.dispose();
  assert.equal(signal.aborted, true);
  response.resolve({ settings: { timestamp: 3, echoOn: false, isPlaying: true } });
  await sending;
  f.store.setState({ micVolume: 0.5 });
  f.sync.receive({ timestamp: 4, echoOn: false });
  await f.sync.flush();
  assert.equal(f.store.getState().echoOn, true);
  assert.equal(f.store.getState().isPlaying, false);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.errors, []);
});
