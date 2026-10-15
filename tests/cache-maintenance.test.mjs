import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedCandidates, metadataHash, publicationPlan, validateMaintenance } from '../lib/lyrics/cacheMaintenance.js';
import { formatLyrics } from '../lib/lyrics/engine.js';

const line = { time: 1, text: 'Saved reference words', words: [{ word: 'Saved', start: 1, end: 2 }] };
const metadata = { title: 'Song', artist: 'Artist', source: 'lrclib_aligned', lyrics: [line] };
const result = { source: 'lrclib_qwen_aligned', lyrics: [{ ...line, time: 2 }],
  transcription: { provider: 'qwen', independent: true, duration: 10 }, cacheTiming: { aligned: false } };

test('cached LRCLIB references keep native/romanized ownership and timing for verification', () => {
  const original = { label: 'Original (Native)', lyrics: [line] }, romanized = { label: 'Romanized', lyrics: [line] };
  const candidates = cachedCandidates('abcdefghijk', { ...metadata, lyrics: [original, romanized] });
  assert.equal(candidates[1].derivedFrom, candidates[0].id);
  assert.equal(candidates[0].cached, true);
  assert.equal(candidates[1].cached, false);
  assert.deepEqual(formatLyrics(candidates)[0].lines, [line]);
  assert.equal(formatLyrics(candidates)[0].cached, true);
});

test('verified LRCLIB timing preserves all saved lyric text and intervals', () => {
  const plan = publicationPlan(metadata, { ...result, cacheTiming: { aligned: true } });
  assert.equal(plan.action, 'verified-lrclib');
  assert.equal(plan.result.lyrics, metadata.lyrics);
  assert.equal(plan.result.source, 'lrclib_qwen_aligned');
});

test('drifting LRCLIB timing uses Qwen alignment; text mismatch cannot replace published lyrics', () => {
  assert.equal(publicationPlan(metadata, result).action, 'realigned-lrclib');
  const held = publicationPlan(metadata, { ...result, source: 'qwen_transcription' });
  assert.equal(held.action, 'review-required');
  assert.equal(held.result, undefined);
  assert.equal(publicationPlan(metadata, { ...result, lyrics: [] }).action, 'review-required');
  assert.equal(publicationPlan(metadata, { ...result,
    transcription: { ...result.transcription, timingValidation: { reason: 'timing_pass_failed' } } }).reason, 'timing_pass_failed');
});

test('Whisper-only and missing results upgrade through independent Qwen evidence', () => {
  assert.equal(publicationPlan({ ...metadata, source: 'whisper_fallback' }, result).action, 'upgraded-to-qwen');
  assert.equal(publicationPlan({ ...metadata, source: 'Unknown' }, result).action, 'upgraded-to-qwen');
  assert.throws(() => publicationPlan(metadata, { ...result, transcription: { provider: 'whisper' } }), /independent Qwen/);
});

test('maintenance requests require a backup hash and safe run identity; normal repair is unchanged', () => {
  const body = { mode: 'refresh-cache', runId: '2026-10-15-run', expectedMetadataHash: metadataHash(metadata) };
  assert.equal(validateMaintenance(body), true);
  assert.equal(validateMaintenance({}), false);
  for (const patch of [{ runId: '../invalid' }, { runId: 123 }, { expectedMetadataHash: '' }, { mode: 'other' }]) {
    assert.throws(() => validateMaintenance({ ...body, ...patch }), { status: 400 });
  }
  assert.notEqual(metadataHash(metadata), metadataHash({ ...metadata, lyrics: [] }));
});
