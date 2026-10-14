import { NextResponse } from 'next/server';
import { runLyricsEngine } from '../../../../lib/lyrics/engine';
import { isValidJobId } from '../../../../lib/http/validators';
import { checkCache, getSavedTranscription } from '../../../../lib/storage/index';
import { fetchLyrics } from '../../../../lib/lyrics/candidates';
import { saveLyricsResult } from '../../../../lib/lyrics/results';
import { checkRateLimit, getClientIp } from '../../../../lib/http/rateLimiter';
import { readJsonObject } from '../../../../lib/http/requestBody';
import { processingScheduler } from '../../../../lib/processing/index';


export async function POST(request) {
  // Rate limit: max 3 Whisper sync requests per minute per IP (very expensive operation)
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`whisper:${clientIp}`, { maxRequests: 3, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many sync requests. Please slow down.' }, { status: 429 });
  }

  try {
    const body = await readJsonObject(request);
    const { jobId } = body;

    if (!jobId || !isValidJobId(jobId)) {
      return NextResponse.json({ error: 'A valid Job ID is required' }, { status: 400 });
    }

    const existingMetadata = await checkCache(jobId);
    if (!existingMetadata) return NextResponse.json({ error: 'Processed song not found' }, { status: 404 });
    // Resolve candidates on the server; caller-provided lyrics cannot bypass identity matching.
    const candidates = await fetchLyrics(existingMetadata.title, existingMetadata.artist);
    const transcription = await getSavedTranscription(jobId);
    const result = await processingScheduler.submit(`lyrics:${jobId}`, () => runLyricsEngine(jobId, candidates, null, { transcription }));
    const saved = await saveLyricsResult(jobId, existingMetadata, result);
    const { transcription: _transcription, ...response } = result;
    return NextResponse.json({ ...response, lyricsRevision: saved.lyricsRevision });

  } catch (err) {
    console.error('Lyrics sync error:', err);
    return NextResponse.json({ error: err.status >= 400 && err.status < 500 ? err.message : 'An internal error occurred' }, { status: err.status || 500 });
  }
}
