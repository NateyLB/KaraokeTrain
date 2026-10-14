import { uploadJson } from '../storage/index.js';
import { jobQueue } from '../processing/jobQueue.js';

export async function saveLyricsResult(jobId, existingMetadata, result) {
  const lyricsRevision = `${result.lyricsEngineVersion || 3}:${Date.now()}`;
  const metadata = { ...existingMetadata, lyrics: result.lyrics, source: result.source,
    lyricsEngineVersion: result.lyricsEngineVersion, lyricsRevision, lyricsValidation: result.validation };
  if (result.transcription) {
    const { provider, model, aligner, audioSource, language, duration, quality, timingVersion, timingValidation } = result.transcription;
    metadata.transcription = { provider, model, aligner, audioSource, language, duration, quality, timingVersion, timingValidation };
  }
  if (result.transcription) {
    await uploadJson(result.transcription, `processedSongs/${jobId}/transcription.json`);
  }
  await uploadJson(metadata, `processedSongs/${jobId}/metadata.json`);
  // Refresh the active room's lyrics without restarting its video or audio.
  jobQueue.update(jobId, { lyrics: result.lyrics, lyricsSource: result.source, lyricsRevision,
    lyricsEngineVersion: result.lyricsEngineVersion, lyricsValidation: result.validation });
  return metadata;
}
