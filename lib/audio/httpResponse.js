import { Readable } from 'node:stream';

export function parseByteRange(header, size) {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function createAudioResponse(file, rangeHeader, contentType) {
  const range = rangeHeader ? parseByteRange(rangeHeader, file.size) : undefined;
  if (rangeHeader && !range) {
    return new Response('Invalid range', {
      status: 416,
      headers: { 'Content-Range': `bytes */${file.size}` },
    });
  }

  const headers = {
    'Content-Type': contentType,
    'Content-Length': String(range ? range.end - range.start + 1 : file.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`;

  return new Response(Readable.toWeb(file.createReadStream(range)), {
    status: range ? 206 : 200,
    headers,
  });
}
