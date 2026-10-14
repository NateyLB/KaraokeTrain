import { after, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { checkCache, uploadJson } from '../../../../lib/storage';
import { fetchLyrics } from '../../../../lib/lyrics';
import { runWhisper } from '../../../../lib/whisper_runner';
import { isValidVideoId } from '../../../../lib/validators';
import { jobQueue } from '../../../../lib/jobQueue';
import { partyStore } from '../../../../lib/partyStore';

export const runtime = 'nodejs';
export const maxDuration = 1500;

// Same single persistent Node-server deployment as the web party/job stores.
// Restarting the server loses in-flight work, not stems or completed lyrics.
const jobs = globalThis.nativeLyricsJobs ??= new Map();
const reply = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

function authorize(request) {
  const expected = process.env.DOWNLOADER_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!expected || !provided) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function publishReady(videoId, metadata) {
  jobQueue.update(videoId, { status: 'ready', progress: 100, lyrics: metadata.lyrics, lyricsSource: metadata.source });
  for (const [id, party] of globalThis.karaokeParties ?? []) {
    if (party.currentSong?.videoId === videoId || party.queue.some(song => song.videoId === videoId)) {
      partyStore.update(id, {});
    }
  }
}

export async function GET(request) {
  if (!authorize(request)) return reply({ error: 'Forbidden' }, 403);
  const id = new URL(request.url).searchParams.get('videoId');
  if (!isValidVideoId(id)) return reply({ error: 'Invalid video ID' }, 400);
  const job = jobs.get(id);
  if (job) return reply(job);
  try {
    const metadata = await checkCache(id);
    if (metadata && (metadata.lyricsComplete || metadata.lyrics?.length)) {
      return reply({ status: 'complete', source: metadata.source || 'cached', lyrics: metadata.lyrics || [] });
    }
    return reply({ error: 'Lyrics session expired. Retry to continue from cached audio.' }, 404);
  } catch {
    return reply({ error: 'Could not read GCS lyrics.' }, 503);
  }
}

export async function POST(request) {
  if (!authorize(request)) return reply({ error: 'Forbidden' }, 403);
  if (process.env.STORAGE_MODE !== 'gcs' || !process.env.GCS_BUCKET_NAME) {
    return reply({ error: 'Configure STORAGE_MODE=gcs and GCS_BUCKET_NAME on the web server.' }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Invalid JSON' }, 400); }
  const id = body?.videoId;
  if (!isValidVideoId(id)) return reply({ error: 'Invalid video ID' }, 400);
  const running = jobs.get(id);
  if (running?.status === 'processing') return reply(running, 202);
  // Bound work and retained results, including after long-running dev sessions.
  for (const [key, job] of jobs) {
    if (job.status !== 'processing' && Date.now() - job.updated > 30 * 60 * 1000) jobs.delete(key);
  }
  if ([...jobs.values()].some(job => job.status === 'processing')) {
    return reply({ error: 'Another song is being transcribed. Retry shortly.' }, 409);
  }
  // Reserve before any await so two requests cannot start two Whisper processes.
  const job = { status: 'processing', progress: 0, updated: Date.now() };
  jobs.set(id, job);
  try {
    const metadata = await checkCache(id);
    if (!metadata) { jobs.delete(id); return reply({ error: 'Stems must finish uploading first.' }, 409); }
    if (metadata.lyricsComplete || metadata.lyrics?.length) {
      Object.assign(job, { status: 'complete', source: metadata.source || 'cached', lyrics: metadata.lyrics || [] });
      publishReady(id, metadata);
      return reply(job);
    }
    const audioURL = new URL('/stems', process.env.DOWNLOADER_API_URL || 'http://127.0.0.1:4000');
    audioURL.search = new URLSearchParams({ jobId: id, stem: 'vocals', secret: process.env.DOWNLOADER_SECRET }).toString();
    after(async () => {
      try {
        // Preserve the web's multilingual lookup, romanization and word alignment.
        const candidates = await fetchLyrics(metadata.title, metadata.artist).catch(() => null);
        const result = await runWhisper(id, candidates, progress => { job.progress = Math.min(99, progress); }, {
          audioURL: audioURL.toString(),
          duration: metadata.nativeSeparation?.totalFrames / metadata.nativeSeparation?.sampleRate,
        });
        if (!Array.isArray(result.lyrics)) throw new Error('Invalid lyrics response');
        const updated = { ...metadata, lyrics: result.lyrics, source: result.source, lyricsComplete: true };
        await uploadJson(updated, `processedSongs/${id}/metadata.json`);
        Object.assign(job, { status: 'complete', progress: 100, ...result, updated: Date.now() });
        publishReady(id, updated);
      } catch (error) {
        console.error('[native lyrics]', error.message);
        Object.assign(job, { status: 'error', error: 'Lyrics failed. Audio is saved; check the web server log and retry lyrics.', updated: Date.now() });
      }
    });
    return reply(job, 202);
  } catch (error) {
    jobs.delete(id);
    console.error('[native lyrics]', error.message);
    return reply({ error: 'Could not start transcription. Check the web server configuration.' }, 503);
  }
}
