import { Readable } from 'node:stream';
import { getFileStream } from '../../../lib/storage';
import { isValidJobId, isValidStem } from '../../../lib/validators';
import { parseByteRange } from '../../../../shared/http-range.mjs';

export const runtime = 'nodejs';

async function respond(request, head = false) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId'), stem = searchParams.get('stem');
  if (!isValidJobId(jobId) || !isValidStem(stem)) return new Response('Invalid jobId or stem', { status: 400 });
  try {
    const file = await getFileStream(jobId, stem);
    if (!file || !Number.isSafeInteger(file.size) || file.size < 1) return new Response('Stem not found', { status: 404 });
    const range = parseByteRange(request.headers.get('range'), file.size);
    if (range === false) return new Response('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
    const headers = {
      'Content-Type': stem === 'multiplex' ? 'audio/mp4' : 'audio/wav',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range ? range.end - range.start + 1 : file.size),
    };
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`;
    // Open one stream after validation, with backpressure and cancellation.
    return new Response(head ? null : Readable.toWeb(file.openStream(range || {})), { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error('[stems]', error.message);
    return new Response('Audio storage is unavailable. Retry shortly.', { status: 503 });
  }
}

export function GET(request) { return respond(request); }
export function HEAD(request) { return respond(request, true); }
