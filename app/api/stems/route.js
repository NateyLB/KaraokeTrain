import { NextResponse } from 'next/server';
import { getFileStream } from '../../../lib/storage';
import { isValidJobId, isValidStem } from '../../../lib/validators';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const stem = searchParams.get('stem');

  // SECURITY: Strict validation prevents path traversal attacks
  if (!jobId || !isValidJobId(jobId)) {
    return new NextResponse('Invalid or missing jobId', { status: 400 });
  }

  if (!stem || !isValidStem(stem)) {
    return new NextResponse('Invalid or missing stem (must be: vocals, bass, drums, or other)', { status: 400 });
  }

  const fileData = await getFileStream(jobId, stem);

  if (!fileData) {
    return new NextResponse('Stem not found', { status: 404 });
  }

  const fileSize = fileData.size;
  const range = request.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // SECURITY: Validate range values
    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
      return new NextResponse('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
    }

    const chunksize = end - start + 1;
    
    const streamOptions = { start, end };
    const stream = fileData.source === 'gcs' 
      ? fileData.gcsFile.createReadStream(streamOptions) 
      : fileData.stream;

    // If local, we should create a NEW stream with start/end
    const finalStream = fileData.source === 'local'
      ? require('fs').createReadStream(fileData.stream.path, streamOptions)
      : stream;

    return new NextResponse(finalStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
      },
    });
  } else {
    return new NextResponse(fileData.stream, {
      status: 200,
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'audio/wav',
      },
    });
  }
}
