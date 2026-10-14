import { NextResponse } from 'next/server';
import { songProcessing } from '../../../../lib/processing/index';
import { isValidVideoId } from '../../../../lib/http/validators';
import { checkRateLimit, getClientIp } from '../../../../lib/http/rateLimiter';

export const maxDuration = 300;

export async function POST(request) {
  // Rate limit: max 5 separation requests per minute per IP
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`separate:${clientIp}`, { maxRequests: 5, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many processing requests. Please slow down.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const title = searchParams.get('title') || 'Unknown Title';
  const artist = searchParams.get('artist') || 'Unknown Artist';

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: 'A valid YouTube videoId is required' }, { status: 400 });
  }

  try {
    return NextResponse.json(await songProcessing.start({ videoId, title, artist }));
  } catch (error) {
    console.error('Failed to start processing:', error);
    return NextResponse.json({ error: error.status === 429 ? error.message : 'Could not start processing. Please try again.' }, { status: error.status || 500 });
  }
}
