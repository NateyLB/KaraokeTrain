import { fetchLyrics } from '../../../lib/lyrics';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimiter';

function cleanMetadata(trackRaw, artistRaw) {
  // Remove content inside brackets/parentheses like (Official Video), [Lyric Video]
  let t = trackRaw.replace(/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '');
  
  // Remove common fluff like "- Live at ..." or "Live"
  t = t.replace(/-?\s*Live at.*$/i, '');
  t = t.replace(/-?\s*Live(?!.*-).*$/i, '');

  let a = artistRaw.replace(/VEVO$/i, '').replace(/Official$/i, '').replace(/Topic$/i, '').trim();

  // If title has a hyphen, it's usually "Artist - Song"
  if (t.includes('-')) {
    const parts = t.split('-');
    a = parts[0].trim();
    t = parts[1].trim();
  }

  return { cleanTrack: t.trim(), cleanArtist: a.trim() };
}

export async function GET(request) {
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

  const { cleanTrack, cleanArtist } = cleanMetadata(trackRaw, artistRaw);
  console.log(`Lyrics Search: "${cleanTrack}" by "${cleanArtist}"`);

  try {
    const lyrics = await fetchLyrics(cleanTrack, cleanArtist);
    return Response.json({ lyrics });
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    return Response.json({ lyrics: null }, { status: 200 }); // Fail gracefully, don't expose internals
  }
}
