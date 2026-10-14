// Preserve meaningful parentheses and hyphens; only strip video decoration.
export function cleanForLyrics(trackRaw = '', artistRaw = '') {
  let track = trackRaw.trim();
  let artist = artistRaw.replace(/\s*-\s*Topic$/i, '').replace(/(?:VEVO|\s+Official(?:\s+Channel)?)$/i, '').trim();
  const quoted = track.match(/^(.*?)\s+['"]([^'"]+)['"]\s*(?:\(?Official|MV|Music Video)/i);
  if (quoted) {
    artist = quoted[1].trim();
    track = quoted[2].trim();
  } else {
    track = track.replace(/[\[(【]([^\])】]+)[\])】]/g, (whole, text) =>
      /^(?:official|music video|lyrics?|audio|hd\b|4k\b|live\b|visualizer)/i.test(text.trim()) ? '' : whole);
    track = track.replace(/\s*[|–—-]\s*(?:official\b|live\s+(?:at|from|on)\b|lyrics?\b|music video\b|audio\b).*$/i, '').trim();
    const separator = track.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (separator) {
      artist = separator[1].trim();
      track = separator[2].trim();
    }
  }
  return { cleanedTrack: track.trim(), cleanedArtist: artist.trim() };
}

export function normalizeIdentity(text = '') {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function isExactLyricsMatch(candidate, title, artist) {
  return Boolean(normalizeIdentity(title) && normalizeIdentity(artist)) &&
    normalizeIdentity(candidate.trackName) === normalizeIdentity(title) &&
    normalizeIdentity(candidate.artistName) === normalizeIdentity(artist);
}

export async function fetchLyrics(rawTrackName, rawArtistName, { fetchImpl = fetch } = {}) {
  const { cleanedTrack, cleanedArtist } = cleanForLyrics(rawTrackName, rawArtistName);
  if (!cleanedTrack || !cleanedArtist) return null;
  const queries = [...new Set([`${cleanedArtist} ${cleanedTrack}`, cleanedTrack])];
  let matches = [];
  for (const q of queries) {
    try {
      const response = await fetchImpl(`https://lrclib.net/api/search?${new URLSearchParams({ q })}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data)) continue;
      matches = data.filter(candidate => isExactLyricsMatch(candidate, cleanedTrack, cleanedArtist) &&
        (candidate.syncedLyrics || candidate.plainLyrics));
      if (matches.length) break;
    } catch (error) {
      console.warn('LRCLIB lookup failed:', error.message);
    }
  }
  // Distinct exact candidates are checked separately against the recording.
  const seen = new Set();
  const results = matches.sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)))
    .filter(match => {
      const key = match.syncedLyrics || match.plainLyrics;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8).map(match => ({
      id: match.id, trackName: match.trackName, artistName: match.artistName,
      syncedLyrics: match.syncedLyrics, plainLyrics: match.plainLyrics,
      exactMatch: true,
      isNative: /[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]/.test(match.syncedLyrics || match.plainLyrics),
    }));
  for (const native of [...results].filter(result => result.isNative)) {
    try {
      const { synthesizePhonetic } = await import('./romanize.js');
      const derived = await synthesizePhonetic(native);
      if (derived) results.push({ ...derived, derivedFrom: native.id });
    } catch (error) {
      console.warn('Lyrics romanization failed:', error.message);
    }
  }
  return results.length ? results : null;
}

export function parseLRC(lrcString) {
  if (!lrcString) return [];
  const offset = Number(lrcString.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
  const timestamp = /\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const parsed = [];
  for (const line of lrcString.split(/\r?\n/)) {
    const matches = [...line.matchAll(timestamp)];
    const text = line.replace(timestamp, '').trim();
    if (!text) continue;
    for (const match of matches) {
      if (Number(match[2]) >= 60) continue;
      parsed.push({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`) + offset), text });
    }
  }
  return parsed.sort((a, b) => a.time - b.time);
}
