import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneEngine } from '../lib/audio/MicrophoneEngine.js';
import { MultiplexGraph } from '../lib/audio/MultiplexGraph.js';
import { pauseMedia, playMedia } from '../lib/audio/media.js';

function audioFixture() {
  const nodes = [];
  const makeNode = () => {
    const node = { connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() { this.stopped = true; },
      gain: { value: 0, setTargetAtTime(value) { this.value = value; } },
      frequency: { value: 0, setTargetAtTime(value) { this.value = value; } }, delayTime: {}, getFloatTimeDomainData(buffer) { buffer.fill(0); } };
    nodes.push(node); return node;
  };
  const track = { stop() { this.stopped = true; }, applyConstraints: async () => {} };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const context = { sampleRate: 48000, currentTime: 0, destination: {}, resume: async () => {}, createGain: makeNode,
    createAnalyser: makeNode, createMediaStreamSource: makeNode, createDelay: makeNode,
    createOscillator: makeNode, createBiquadFilter: makeNode, createMediaElementSource: makeNode,
    createChannelSplitter: makeNode, createChannelMerger: makeNode };
  return { nodes, track, stream, context, runtime: () => ({ context, recordingDestination: {} }) };
}

test('stopping a microphone disconnects every node, feedback loop and live track', async () => {
  const fixture = audioFixture();
  let cancelled;
  const engine = new MicrophoneEngine({ ...fixture, getMedia: async () => fixture.stream, requestFrame: () => 17, cancelFrame: id => { cancelled = id; } });
  await engine.start();
  engine.stop();
  assert.equal(fixture.track.stopped, true);
  assert.equal(cancelled, 17);
  assert.ok(fixture.nodes.length > 5);
  assert.ok(fixture.nodes.every(node => node.disconnected));
  engine.stop(); // cleanup is idempotent and never closes the shared context
});

test('a late microphone permission result cannot attach after stop/dispose', async () => {
  const fixture = audioFixture();
  let allow;
  const permission = new Promise(resolve => { allow = resolve; });
  const changes = [];
  const engine = new MicrophoneEngine({ runtime: fixture.runtime, getMedia: () => permission, onChange: change => changes.push(change) });
  const request = engine.start();
  engine.dispose();
  allow(fixture.stream);
  await request;
  assert.equal(fixture.track.stopped, true);
  assert.equal(fixture.nodes.length, 0);
  assert.equal(changes.length, 0);
});

test('audio graph initialization failure releases the acquired microphone', async () => {
  const fixture = audioFixture();
  const engine = new MicrophoneEngine({ getMedia: async () => fixture.stream, runtime: () => { throw new Error('no audio context'); } });
  await engine.start();
  assert.equal(fixture.track.stopped, true);
});

test('switching songs disconnects old playback nodes and reuses element sources safely', () => {
  const fixture = audioFixture();
  const graph = new MultiplexGraph(fixture.runtime);
  const first = {}, second = {};
  graph.attach(first);
  const old = [...fixture.nodes];
  graph.attach(second);
  assert.ok(old.every(node => node.disconnected));
  graph.detach();
  assert.ok(fixture.nodes.every(node => node.disconnected));
  const before = fixture.nodes.length;
  graph.attach(first);
  assert.equal(fixture.nodes.length - before, 4); // source is created once per media element
  graph.detach();
});

test('pausing during a pending play stops immediately and suppresses stale errors', async () => {
  let reject, paused = false, errors = 0;
  const audio = { play: () => new Promise((_, fail) => { reject = fail; }), pause: () => { paused = true; } };
  playMedia(audio, () => { errors++; });
  pauseMedia(audio);
  assert.equal(paused, true);
  reject(new Error('old playback request'));
  await Promise.resolve();
  assert.equal(errors, 0);
});
