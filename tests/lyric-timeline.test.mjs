import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareLyricTimeline, lyricPlaybackState, wordProgress, selectedLyrics, wordSeparator } from '../lib/lyrics/timeline.js';
const line = (text,start,end,time=start) => ({text,time,words:[{word:text,start,end}]});
test('actual word times override stale studio line starts',()=>{
  const t=prepareLyricTimeline([line('second',7,9,1),line('first',2,6,80)]);
  assert.deepEqual(t.map(l=>l.start),[2,7]);
  assert.equal(lyricPlaybackState(t,5.9).index,0);
});
test('preview cannot hide the previous sustained final word',()=>{
  const t=prepareLyricTimeline([line('held',0,4.9),line('next',5,7)]);
  assert.equal(lyricPlaybackState(t,4.8).index,0);
  assert.equal(lyricPlaybackState(t,4.95).index,1);
});
test('instrumental gaps preview the next line with no false singing',()=>{
  const t=prepareLyricTimeline([line('first',1,4),line('next',20,23)]);
  assert.deepEqual(lyricPlaybackState(t,10),{index:1,singing:false,rest:true,countdown:10});
  assert.equal(lyricPlaybackState(t,21).singing,true);
});
test('seeking backward selects the proper line and resets word fill',()=>{
  const t=prepareLyricTimeline([line('first',1,4),line('second',5,7)]);
  assert.equal(lyricPlaybackState(t,6).index,1);
  assert.equal(lyricPlaybackState(t,2).index,0);
  assert.equal(wordProgress({start:5,end:7},2),0);
  assert.equal(wordProgress({start:1,end:4},2),1/3);
});
test('invalid words and empty lyrics are safe',()=>{
  assert.equal(prepareLyricTimeline([line('bad',NaN,Infinity,NaN)]).length,0);
  assert.equal(lyricPlaybackState([],0).index,-1);
  assert.equal(wordProgress({start:2,end:2},2),0);
});
test('selected languages and native character spacing are preserved',()=>{
  assert.deepEqual(selectedLyrics([{lyrics:['original']},{lyrics:['phonetic']}],1),['phonetic']);
  assert.deepEqual(selectedLyrics([{lyrics:['original']}],9),['original']);
  assert.equal(wordSeparator('你','好'),'');
  assert.equal(wordSeparator('hello','world'),' ');
});
test('web lyric states match the fixtures consumed by the native Swift port', () => {
  const fixtures = JSON.parse(readFileSync(new URL('./fixtures/lyric-timeline.json', import.meta.url), 'utf8'));
  for (const fixture of fixtures) {
    const timeline = prepareLyricTimeline(fixture.lines);
    for (const { time, ...expected } of fixture.samples) {
      const actual = lyricPlaybackState(timeline, time);
      assert.deepEqual({ ...actual, finished: Boolean(actual.finished) }, expected, `${fixture.name} at ${time}`);
    }
  }
});
