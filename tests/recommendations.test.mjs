import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendSongs } from '../lib/search/recommendations.js';

test('DJ requests include bounded room context and validate structured recommendations', async () => {
  let context;
  const result = await recommendSongs({ prompt: 'Three songs', currentSong: { title: 'Current', artist: 'Artist', private: 'discard' }, history: Array(100).fill({ title: 'Past' }) }, {
    apiKey: 'test-only', request: async (_, options) => {
      const body = JSON.parse(options.body);
      context = JSON.parse(body.contents[0].parts[0].text);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ message: 'Try these', recommended_queries: [' A ', 'B', 'C'] }) }] } }] }) };
    },
  });
  assert.equal(context.currentSong.title, 'Current');
  assert.equal(context.currentSong.private, undefined);
  assert.equal(context.history.length, 20);
  assert.deepEqual(result.recommended_queries, ['A', 'B', 'C']);
});
test('missing credentials and invalid output are explicit failures, without fabricated suggestions', async () => {
  await assert.rejects(recommendSongs({}, { apiKey: '' }), /unavailable/);
  await assert.rejects(recommendSongs({}, { apiKey: 'test-only', request: async () => ({ ok: true, json: async () => ({}) }) }), /invalid recommendation/);
});
