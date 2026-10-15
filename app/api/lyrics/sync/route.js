import { NextResponse } from 'next/server';
import { runLyricsEngine } from '../../../../lib/lyrics/engine';
import { isValidJobId } from '../../../../lib/http/validators';
import { checkCache, getSavedTranscription } from '../../../../lib/storage/index';
import { fetchLyrics } from '../../../../lib/lyrics/candidates';
import { saveLyricsResult } from '../../../../lib/lyrics/results';
import { checkRateLimit, getClientIp } from '../../../../lib/http/rateLimiter';
import { readJsonObject } from '../../../../lib/http/requestBody';
import { processingScheduler } from '../../../../lib/processing/index';
import { cachedCandidates, isLRCLIB, metadataHash, publicationPlan, validateMaintenance } from '../../../../lib/lyrics/cacheMaintenance';


export async function POST(request) {
  // Rate limit expensive transcription/alignment requests.
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`whisper:${clientIp}`, { maxRequests: 3, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many sync requests. Please slow down.' }, { status: 429 });
  }

  try {
    const body = await readJsonObject(request);
    const { jobId } = body;
    const maintenance = validateMaintenance(body);

    if (!jobId || !isValidJobId(jobId)) {
      return NextResponse.json({ error: 'A valid Job ID is required' }, { status: 400 });
    }

    const response = await processingScheduler.submit(`lyrics:${jobId}`, async () => {
      const existingMetadata = await checkCache(jobId);
      if (!existingMetadata) throw Object.assign(new Error('Processed song not found'), { status: 404 });
      if (maintenance && existingMetadata.lyricsMaintenance?.runId === body.runId) {
        return { lyricsRevision: existingMetadata.lyricsRevision, maintenance: existingMetadata.lyricsMaintenance };
      }
      if (maintenance && metadataHash(existingMetadata) !== body.expectedMetadataHash) {
        throw Object.assign(new Error('Saved lyrics changed after the backup; refresh the snapshot before retrying.'), { status: 409 });
      }
      // Caller-provided lyric text cannot bypass independent matching.
      const candidates = maintenance && isLRCLIB(existingMetadata) ? cachedCandidates(jobId, existingMetadata) :
        await fetchLyrics(existingMetadata.title, existingMetadata.artist);
      const transcription = await getSavedTranscription(jobId);
      let lastProgress = -10;
      const onProgress = maintenance ? progress => {
        if (progress - lastProgress >= 10) {
          lastProgress = progress;
          console.log(`[LyricsRefresh] ${jobId}: ${progress}%`);
        }
      } : null;
      const result = await runLyricsEngine(jobId, candidates, onProgress, { transcription });
      let published = result, report;
      if (maintenance) {
        const plan = publicationPlan(existingMetadata, result);
        report = { runId: body.runId, action: plan.action, reason: plan.reason, check: result.cacheTiming,
          previousSource: existingMetadata.source, provider: result.transcription?.provider,
          timingAccepted: result.transcription?.timingValidation?.accepted, checkedAt: new Date().toISOString() };
        if (!plan.result) return { maintenance: report };
        published = plan.result;
        if (metadataHash(await checkCache(jobId)) !== body.expectedMetadataHash) {
          throw Object.assign(new Error('Saved lyrics changed while processing; the refresh was not published.'), { status: 409 });
        }
      }
      const saved = await saveLyricsResult(jobId, { ...existingMetadata, ...(report ? { lyricsMaintenance: report } : {}) }, published);
      const { transcription: _transcription, ...payload } = published;
      return { ...payload, lyricsRevision: saved.lyricsRevision, ...(report ? { maintenance: report } : {}) };
    });
    return NextResponse.json(response);

  } catch (err) {
    console.error('Lyrics sync error:', err);
    return NextResponse.json({ error: err.status >= 400 && err.status < 500 ? err.message : 'An internal error occurred' }, { status: err.status || 500 });
  }
}
