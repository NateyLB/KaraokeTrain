import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../ios/KaraokeTrain/KaraokeTrain/YouTubeBridge.js', import.meta.url), 'utf8');
function player() {
  const calls = [], messages = [];
  let options, loader;
  const state = { code: 3, time: 0 };
  const context = {
    window: {
      karaokeVideoConfig: { videoId: 'testVideo01', origin: 'https://karaoketrain.karaoketrain' },
      webkit: { messageHandlers: { karaokeVideo: { postMessage(message) { messages.push(message); } } } },
    },
    document: { createElement() { return {}; }, head: { appendChild(value) { loader = value; } } },
    YT: { Player: function (_, input) {
      options = input;
      return {
        mute() {}, getCurrentTime() { return state.time; }, getPlayerState() { return state.code; },
        playVideo() { calls.push('play'); }, pauseVideo() { calls.push('pause'); },
        seekTo(time) { calls.push(['seek', time]); },
      };
    } },
  };
  vm.runInNewContext(script, context);
  return { calls, messages, state, window: context.window, ready() {
    context.window.onYouTubeIframeAPIReady(); options.events.onReady();
  }, options: () => options, loader: () => loader };
}

test('play request before YouTube readiness is preserved; origin is explicit', () => {
  const p = player(); p.window.syncPlayback(12, true); p.ready();
  assert.deepEqual(p.calls, [['seek', 12], 'play']);
  assert.equal(p.options().playerVars.origin, 'https://karaoketrain.karaoketrain');
  assert.equal(p.options().playerVars.playsinline, 1);
  assert.equal(p.messages[0].type, 'ready');
});

test('buffering does not cause repeated seek/play loops', () => {
  const p = player(); p.window.syncPlayback(0, true); p.ready();
  for (let time = 0; time < 20; time += 0.5) p.window.syncPlayback(time, true);
  assert.deepEqual(p.calls, ['play']);
  p.state.code = 1;
  p.window.syncPlayback(20, true);
  assert.deepEqual(p.calls.at(-1), ['seek', 20]);
  p.window.syncPlayback(5, false);
  assert.equal(p.calls.at(-1), 'pause');
});

test('YouTube and network errors are observable; invalid times are ignored', () => {
  const p = player(); p.ready();
  p.options().events.onError({ data: 153 });
  p.options().events.onAutoplayBlocked();
  p.loader().onerror();
  assert.deepEqual(p.messages.map(message => message.type), ['ready', 'error', 'blocked', 'network']);
  assert.equal(p.messages[1].code, 153);
  const count = p.calls.length;
  p.window.syncPlayback(Infinity, true);
  p.window.syncPlayback(-1, true);
  assert.equal(p.calls.length, count);
});
