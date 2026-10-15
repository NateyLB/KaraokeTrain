import { createHash } from 'node:crypto';
import { cleanForLyrics } from './candidates.js';

export const metadataHash = metadata => createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
export const isLRCLIB = metadata => metadata.source?.startsWith('lrclib');

export function validateMaintenance(body) {
  if (body.mode === undefined && body.analyzeOnly === undefined) return false;
  if (body.mode !== 'refresh-cache' || typeof body.runId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(body.runId) || typeof body.expectedMetadataHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.expectedMetadataHash) ||
      (body.analyzeOnly !== undefined && typeof body.analyzeOnly !== 'boolean')) {
    throw Object.assign(new Error('A cache refresh requires a valid mode, run ID and metadata hash.'), { status: 400 });
  }
  return true;
}

/** Saved LRCLIB text is a provisional reference, validated against independent ASR. */
export function cachedCandidates(jobId, metadata) {
  const versions = Array.isArray(metadata.lyrics?.[0]?.lyrics) ? metadata.lyrics : [{ label: 'Original', lyrics: metadata.lyrics }];
  const original = versions.find(version => !/roman|phonetic|pinyin|romaja/i.test(version.label || '')) || versions[0];
  if (!Array.isArray(original?.lyrics) || !original.lyrics.length) return null;
  const { cleanedTrack: trackName, cleanedArtist: artistName } = cleanForLyrics(metadata.title, metadata.artist);
  const id = `cache:${jobId}`;
  return versions.map(version => ({ id: version === original ? id : `${id}:${version.label}`,
    derivedFrom: version === original ? undefined : id, cached: version === original,
    exactMatch: true, trackName, artistName, label: version.label || 'Original', lines: version.lyrics }));
}

function primaryLines(lyrics) {
  return Array.isArray(lyrics?.[0]?.lyrics) ? lyrics[0].lyrics : Array.isArray(lyrics) ? lyrics : [];
}

/** A failed/mismatched pass never replaces the published lyrics. */
export function publicationPlan(metadata, result) {
  const transcript = result.transcription;
  if (transcript?.provider !== 'qwen' || !transcript.independent || !(transcript.duration > 0)) {
    throw new Error('Cache maintenance requires an independent Qwen transcript.');
  }
  if (transcript.timingValidation?.reason === 'timing_pass_failed') {
    return { action: 'review-required', reason: 'timing_pass_failed' };
  }
  const words = primaryLines(result.lyrics).flatMap(line => line.words || []);
  if (!words.length || words.some(word => !Number.isFinite(word.start) || !Number.isFinite(word.end) ||
      word.start < 0 || word.end <= word.start || word.end > transcript.duration + .05)) {
    return { action: 'review-required', reason: 'empty_or_invalid_timing' };
  }
  if (isLRCLIB(metadata)) {
    if (result.cacheTiming?.aligned) {
      return { action: 'verified-lrclib', result: { ...result, lyrics: metadata.lyrics,
        source: `lrclib_qwen_aligned${Array.isArray(metadata.lyrics?.[0]?.lyrics) ? '_multi' : ''}` } };
    }
    if (!result.source?.startsWith('lrclib_qwen_aligned')) {
      return { action: 'review-required', reason: 'saved_lyrics_do_not_match_qwen', check: result.cacheTiming };
    }
    return { action: 'realigned-lrclib', result };
  }
  return { action: metadata.source === 'qwen_transcription' ? 'checked-qwen' : 'upgraded-to-qwen', result };
}
