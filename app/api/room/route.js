import { withAccess } from '../../../lib/access/server.js';
import { fetchLyrics } from '../../../lib/lyrics/candidates';
import { checkRateLimit, getClientIp } from '../../../lib/http/rateLimiter';

// cleanMetadata removed - handled inside fetchLyrics

async function handleGET(request) {
  // Rate limit: max 30 lyrics lookups per minute per IP
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`room:${clientIp}`, { maxRequests: 30, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return Response.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const trackRaw = searchParams.get('track');
  const artistRaw = searchParams.get('artist');

  if (!trackRaw || !artistRaw) {
    return Response.json({ error: 'Track and artist are required' }, { status: 400 });
  }

  console.log(`Lyrics Search: "${trackRaw}" by "${artistRaw}"`);

  try {
    const lyrics = await fetchLyrics(trackRaw, artistRaw);
    return Response.json({ lyrics });
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    return Response.json({ lyrics: null }, { status: 200 }); // Fail gracefully, don't expose internals
  }
}

export const GET = withAccess(['owner', 'host'], handleGET);
