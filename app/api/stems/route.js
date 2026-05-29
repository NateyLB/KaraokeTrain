import { NextResponse } from 'next/server';
import { getFileStream, getPublicUrl } from '../../../lib/storage';
import { isValidJobId, isValidStem } from '../../../lib/validators';

function nodeToWebStream(nodeStream) {
  return new globalThis.ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        try {
          controller.enqueue(chunk);
        } catch (e) {
          nodeStream.destroy();
        }
      });
      nodeStream.on('end', () => {
        try { controller.close(); } catch (e) {}
      });
      nodeStream.on('error', (err) => {
        try { controller.error(err); } catch (e) {}
      });
    },
    cancel() {
      nodeStream.destroy();
    }
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const stem = searchParams.get('stem');

  if (!jobId || !isValidJobId(jobId)) {
    return new NextResponse('Invalid or missing jobId', { status: 400 });
  }

  if (!stem || !isValidStem(stem)) {
    return new NextResponse('Invalid or missing stem', { status: 400 });
  }

  // 1. Attempt to generate a Public URL (GCS Mode)
  // This bypasses BOTH Next.js 4MB Response Buffer limits AND Google IAM signing errors.
  const publicUrl = await getPublicUrl(jobId, stem);
  
  if (publicUrl) {
    // 302 Redirect: The browser fetch() will transparently follow this
    // and download the bytes directly from Google Cloud CDN.
    return NextResponse.redirect(publicUrl);
  }

  // 2. Fallback: Local stream or error
  const fileData = await getFileStream(jobId, stem);

  if (!fileData) {
    return new NextResponse('Stem not found', { status: 404 });
  }

  // Only reached in LOCAL mode, where memory limits might be different or manageable
  const fileSize = fileData.size;
  const range = request.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
      return new NextResponse('Invalid range', { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
    }

    const chunksize = end - start + 1;
    const streamOptions = { start, end };
    
    // In local mode, create ReadStream directly
    const finalStream = require('fs').createReadStream(fileData.stream.path, streamOptions);

    return new Response(nodeToWebStream(finalStream), {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': 'audio/wav',
      },
    });
  } else {
    return new Response(nodeToWebStream(fileData.stream), {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': 'audio/wav',
      },
    });
  }
}
