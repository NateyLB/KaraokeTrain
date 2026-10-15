import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../ios/KaraokeTrain/KaraokeTrain/YouTubeBridge.js', import.meta.url), 'utf8');
function fixture() {
  const messages = [], commands = [], timers = new Map();
  let nextTimer = 0, player;
  const window = {
    karaokeVideoConfig: { videoId: 'otNBdB_u2_I', origin: 'https://karaoketrain.karaoketrain' },
    webkit: { messageHandlers: { karaokeVideo: { postMessage: value => messages.push(value) } } }
  };
  class Player {
    constructor(_, options) { this.options = options; this.state = 5; this.time = 0; player = this; }
    mute() {}
    getPlayerState() { return this.state; }
    getCurrentTime() { return this.time; }
    seekTo(time) { commands.push(['seek', time]); this.time = time; if (this.state !== 2) this.emit(3); }
    playVideo() { commands.push(['play']); }
    pauseVideo() { commands.push(['pause']); }
    emit(state) { this.state = state; this.options.events.onStateChange({ data: state }); }
  }
  vm.runInNewContext(script, { window, YT: { Player }, document: { createElement: () => ({}), head: { appendChild() {} } },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id) });
  window.onYouTubeIframeAPIReady();
  player.options.events.onReady();
  return {
    player, commands, messages,
    sync: (time, playing, revision) => window.syncPlayback(time, playing, revision),
    intents: () => messages.filter(message => message.type === 'playbackRequested'),
    settle: () => { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); }
  };
}

test('YouTube pause/resume requests control the native song and do not echo its acknowledgment', () => {
  const f = fixture();
  f.sync(12, true, 1); f.player.emit(1);
  f.player.emit(2); f.settle();
  assert.equal(f.intents().length, 1);
  assert.equal(f.intents()[0].playing, false);
  assert.equal(f.intents()[0].revision, 1);
  assert.equal(f.intents()[0].videoId, 'otNBdB_u2_I');
  f.sync(12.1, false, 2); f.player.emit(2); f.settle();
  assert.equal(f.intents().length, 1);
  f.player.emit(1);
  assert.equal(f.intents().length, 2);
  assert.equal(f.intents()[1].playing, true);
  assert.equal(f.intents()[1].revision, 2);
});

test('native buffering/remote pause and delayed play events never become user playback requests', () => {
  const f = fixture();
  f.sync(10, true, 1); f.player.emit(1);
  f.player.emit(3); f.sync(10, false, 2);
  f.player.emit(1); // Late play acknowledgment from before the pause.
  assert.equal(f.commands.at(-1)[0], 'pause');
  f.player.emit(2); f.settle();
  assert.equal(f.intents().length, 0);
  f.sync(10, true, 3); f.player.emit(1);
  assert.equal(f.intents().length, 0);
});

test('normal audio clock updates do not discard a pending YouTube pause', () => {
  const f = fixture();
  f.sync(10, true, 1); f.player.emit(1);
  f.player.emit(2);
  f.sync(10.5, true, 1);
  f.settle();
  assert.equal(f.intents().length, 1);
  assert.equal(f.intents()[0].playing, false);
});

test('a transient pause during seek or rapid pause/resume does not stop native audio', () => {
  const f = fixture();
  f.sync(0, true, 1); f.player.emit(1);
  f.player.emit(2); f.player.emit(3); f.player.emit(1); f.settle();
  assert.equal(f.intents().length, 0);
  f.player.emit(2); f.player.emit(1); f.settle();
  assert.equal(f.intents().length, 0);
  f.player.emit(2); f.sync(0, false, 2); f.settle();
  assert.equal(f.intents().length, 0, 'New native state must cancel old pending pause intent');
});

test('paused initial cue defers seek/autoplay; paused seeks and normal audio ticks do not echo', () => {
  const f = fixture();
  f.sync(40, false, 1);
  assert.equal(f.commands.length, 0, 'Initial cued video must not auto-start from seekTo');
  f.player.emit(1); // The visible YouTube play button starts both players.
  assert.equal(f.intents()[0].playing, true);
  f.sync(40, true, 2); f.player.emit(1);
  f.sync(40.5, true, 2); f.sync(41, true, 2);
  assert.equal(f.commands.filter(([command]) => command === 'play').length, 0);
  f.sync(41, false, 3); f.player.emit(2);
  f.sync(70, false, 3); f.player.emit(2); f.settle();
  assert.equal(f.commands.at(-1)[0], 'seek');
  assert.equal(f.intents().length, 1);
});

test('stale native revisions and invalid times cannot override a newer pause', () => {
  const f = fixture();
  f.sync(10, true, 1); f.player.emit(1);
  f.sync(10, false, 2); f.player.emit(2);
  const before = f.commands.length;
  f.sync(20, true, 1); f.sync(NaN, true, 3); f.sync(-1, true, 3);
  assert.equal(f.commands.length, before);
  f.settle(); assert.equal(f.intents().length, 0);
});
