import { searchYouTube } from '../../../lib/youtube';
import { checkRateLimit } from '../../../lib/rateLimiter';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  // SECURITY: Rate limit search requests to prevent YouTube API quota exhaustion
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
                 || request.headers.get('x-real-ip') 
                 || 'unknown';
  const rateCheck = checkRateLimit(`search:${clientIp}`, { maxRequests: 20, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return Response.json({ error: 'Too many search requests. Please slow down.' }, { status: 429 });
  }

  // Limit query length to prevent abuse
  const sanitizedQuery = query.slice(0, 200);

  try {
    const tracks = await searchYouTube(sanitizedQuery);
    return Response.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ error: 'Search failed. Please try again.' }, { status: 500 });
  }
}
