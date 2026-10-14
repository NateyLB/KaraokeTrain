import { NextResponse } from 'next/server';
import { getFileStream } from '../../../lib/storage/index';
import { createAudioResponse } from '../../../lib/audio/httpResponse';
import { isValidJobId, isValidStem } from '../../../lib/http/validators';

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

  try {
    // Read private GCS objects with the server's credentials. Keeping the
    // stream on this origin avoids public-bucket and browser CORS assumptions.
    const fileData = await getFileStream(jobId, stem);
    if (!fileData) return new NextResponse('Stem not found', { status: 404 });
    return createAudioResponse(fileData, request.headers.get('range'), stem === 'multiplex' ? 'audio/mp4' : 'audio/wav');
  } catch (error) {
    console.error('Failed to load audio stem:', error);
    return new NextResponse('Audio is temporarily unavailable. Please try again.', { status: 503 });
  }
}
