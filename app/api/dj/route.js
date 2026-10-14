import { readJsonObject } from '../../../lib/http/requestBody';
import { recommendSongs } from '../../../lib/search/recommendations';
import { checkRateLimit, getClientIp } from '../../../lib/http/rateLimiter';

export async function POST(request) {
  const rate = checkRateLimit(`dj:${getClientIp(request)}`, { maxRequests: 6, windowMs: 60000 });
  if (!rate.allowed) return Response.json({ error: 'Too many DJ requests. Please try again shortly.' }, { status: 429 });
  try {
    const input = await readJsonObject(request);
    return Response.json(await recommendSongs(input, { signal: request.signal }));
  } catch (error) {
    return Response.json({ error: error.status ? error.message : 'DJ recommendations are unavailable. Please search for a song instead.' }, { status: error.status || 503 });
  }
}
