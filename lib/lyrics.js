function cleanForLyrics(trackRaw, artistRaw) {
  let t = (trackRaw || '').replace(/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '');
  
  // Handle Chinese brackets 【】 for removing extra metadata (like OST tags)
  t = t.replace(/【[^】]+】/g, '');

  t = t.split('|')[0];
  t = t.replace(/-?\s*Live at.*$/i, '').replace(/-?\s*Live(?!.*-).*$/i, '');
  t = t.replace(/-?\s*Official.*$/i, '');
  let a = (artistRaw || '').replace(/VEVO$/i, '').replace(/Official$/i, '').replace(/Topic$/i, '').trim();

  // If there are Chinese title quotes 《...》 or 「...」, the actual song title is inside them
  const titleMatch = t.match(/[《「『]([^》」』]+)[》」』]/);
  if (titleMatch) {
    t = titleMatch[1].trim();
  } else if (t.includes('-')) {
    const parts = t.split('-');
    a = parts[0].trim();
    t = parts[1].trim();
  }
  
  return { cleanedTrack: t.trim() || trackRaw, cleanedArtist: a.trim() || artistRaw };
}

export async function fetchLyrics(rawTrackName, rawArtistName) {
  const { cleanedTrack, cleanedArtist } = cleanForLyrics(rawTrackName, rawArtistName);

  // Cascading search queries
  const queries = [
    // Level 1: Full raw title + artist
    `${rawArtistName} ${rawTrackName}`.trim(),
    // Level 2: Cleaned artist + cleaned track
    `${cleanedArtist} ${cleanedTrack}`.trim(),
    // Level 3: Cleaned track only
    cleanedTrack
  ];

  let data = null;
  let response = null;

  for (const q of queries) {
    if (!q) continue;
    console.log(`Trying LRCLIB search: "${q}"`);
    const searchQuery = new URLSearchParams({ q });
    response = await fetch(`https://lrclib.net/api/search?${searchQuery.toString()}`);
    
    if (response.ok) {
      const result = await response.json();
      if (result && result.length > 0) {
        data = result;
        break; // Match found, stop cascading
      }
    }
  }

  if (!data || data.length === 0) {
    console.error(`LRCLIB Search Error or no lyrics found for "${rawTrackName}"`);
    return null;
  }

  // Find the best match that has synced lyrics
  const syncedMatch = data.find(track => track.syncedLyrics);
  
  if (syncedMatch) {
    return {
      id: syncedMatch.id,
      trackName: syncedMatch.trackName,
      artistName: syncedMatch.artistName,
      syncedLyrics: syncedMatch.syncedLyrics,
      plainLyrics: syncedMatch.plainLyrics
    };
  }

  // Fallback to plain lyrics if synced isn't available
  if (data[0].plainLyrics) {
    return {
      id: data[0].id,
      trackName: data[0].trackName,
      artistName: data[0].artistName,
      syncedLyrics: null,
      plainLyrics: data[0].plainLyrics
    };
  }

  return null;
}

/**
 * Parses LRC format string into an array of lines with timestamps
 * @param {string} lrcString - The raw LRC text
 * @returns {Array<{time: number, text: string}>}
 */
export function parseLRC(lrcString) {
  if (!lrcString) return [];
  
  const lines = lrcString.split('\n');
  const parsedLyrics = [];
  
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  
  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
      
      const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
      const text = line.replace(timeRegex, '').trim();
      
      if (text) {
        parsedLyrics.push({ time: timeInSeconds, text });
      }
    }
  }
  
  return parsedLyrics;
}
