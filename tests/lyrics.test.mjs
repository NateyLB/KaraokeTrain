import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanForLyrics, isExactLyricsMatch, fetchLyrics, parseLRC } from '../lib/lyrics/candidates.js';
import { formatLyrics } from '../lib/lyrics/engine.js';

test('channel cleanup retains the exact song and artist', () => {
  assert.deepEqual(cleanForLyrics('Day After Day', 'Stuart G - Topic'), { cleanedTrack:'Day After Day', cleanedArtist:'Stuart G' });
  assert.deepEqual(cleanForLyrics('AC-DC — Back in Black (Official Video)', 'Music Channel'), { cleanedTrack:'Back in Black', cleanedArtist:'AC-DC' });
  assert.deepEqual(cleanForLyrics('Spider-Man (Theme)', 'FooVEVO'), { cleanedTrack:'Spider-Man (Theme)', cleanedArtist:'Foo' });
  assert.deepEqual(cleanForLyrics('Artist - Song (Live at Wembley)', 'BBC'), { cleanedTrack:'Song', cleanedArtist:'Artist' });
  assert.equal(isExactLyricsMatch({trackName:'Song',artistName:'Different Artist'}, 'Song','Artist'), false);
  assert.equal(isExactLyricsMatch({trackName:'Song (Remix)',artistName:'Artist'},'Song','Artist'), false);
});

test('first broad result cannot short circuit the exact search', async () => {
  const queries = [];
  const results = await fetchLyrics('Day After Day', 'Stuart G - Topic', { fetchImpl: async url => {
    queries.push(url);
    return Response.json(queries.length === 1 ? [{id:1,trackName:'Day After Day',artistName:'Other Artist',syncedLyrics:'[00:01]Wrong words'}] :
      [{id:2,trackName:'Day After Day',artistName:'Stuart G',plainLyrics:'Verified candidate text'}]);
  }});
  assert.equal(queries.length,2);
  assert.deepEqual(results.map(result => result.id),[2]);
  assert.equal(results[0].exactMatch,true);
});

test('wrong artist and partial title return no candidate', async () => {
  assert.equal(await fetchLyrics('Day After Day','Stuart G', {fetchImpl:async () => Response.json([
    {id:1,trackName:'Day After Day',artistName:'Other',plainLyrics:'Wrong'},
    {id:2,trackName:'Day After Day Again',artistName:'Stuart G',plainLyrics:'Wrong'},
  ])}),null);
});

test('LRC parsing expands multiple stamps, offsets, fractional and whole seconds', () => {
  assert.deepEqual(parseLRC('[offset:-500]\n[01:02][00:01.2]Repeated\n[00:09.123]Other\n[00:99]Invalid'),[
    {time:.7,text:'Repeated'},{time:8.623,text:'Other'},{time:61.5,text:'Repeated'},
  ]);
});

test('candidate identity and phonetic parent survive formatting; English is not romanized', () => {
  const data = formatLyrics([{id:42,exactMatch:true,trackName:'Song',artistName:'Artist',syncedLyrics:'[00:05]Some lyrics'},
    {id:'42_romanized',derivedFrom:42,label:'Romanized',plainLyrics:'Some phonetics'}]);
  assert.equal(data[0].id,42);
  assert.equal(data[0].label,'Original');
  assert.equal(data[0].exactMatch,true);
  assert.equal(data[1].derivedFrom,42);
});
