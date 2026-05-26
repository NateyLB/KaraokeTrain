import { NextResponse } from 'next/server';
import { getFileStream } from '../../../lib/storage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const stem = searchParams.get('stem');

  if (!jobId || !stem) {
    return new NextResponse('Missing parameters', { status: 400 });
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
    const chunksize = end - start + 1;
    
    const streamOptions = { start, end };
    const stream = fileData.source === 'gcs' 
      ? fileData.gcsFile.createReadStream(streamOptions) 
      : fileData.stream; // fs.createReadStream handles start/end differently, wait!

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
