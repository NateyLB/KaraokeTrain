function cleanForLyrics(trackRaw, artistRaw) {
  let t = trackRaw || '';
  let a = artistRaw || '';

  // Extract from K-Pop style quotes e.g. Artist 'Title' MV
  const mvQuoteMatch = t.match(/^(.*?)\s*['"]([^'"]+)['"]\s*(?:\(?Official|MV|Music Video)/i);
  if (mvQuoteMatch) {
    a = mvQuoteMatch[1].trim();
    t = mvQuoteMatch[2].trim();
  } else {
    // Normal aggressive cleaning
    t = t.replace(/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '');
    t = t.replace(/【[^】]+】/g, '');
    t = t.split('|')[0];
    t = t.replace(/-?\s*Live at.*$/i, '').replace(/-?\s*Live(?!.*-).*$/i, '');
    t = t.replace(/-?\s*Official.*$/i, '');
    
    const titleMatch = t.match(/[《「『]([^》」』]+)[》」』]/);
    if (titleMatch) {
      t = titleMatch[1].trim();
    } else if (t.includes('-')) {
      const parts = t.split('-');
      a = parts[0].trim();
      t = parts[1].trim();
    }
  }

  a = a.replace(/VEVO$/i, '').replace(/Official$/i, '').replace(/Topic$/i, '').trim();

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

  // Find ALL matches that have synced lyrics
  const syncedMatches = data.filter(track => track.syncedLyrics);
  
  if (syncedMatches.length > 0) {
    const results = syncedMatches.map(match => ({
      id: match.id,
      trackName: match.trackName,
      artistName: match.artistName,
      syncedLyrics: match.syncedLyrics,
      plainLyrics: match.plainLyrics,
      isNative: /[\uac00-\ud7a3\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(match.syncedLyrics)
    }));

    const filteredResults = [];
    const nativeVer = results.find(r => r.isNative);
    const romanizedVer = results.find(r => !r.isNative);

    if (nativeVer) filteredResults.push(nativeVer);
    if (romanizedVer) filteredResults.push(romanizedVer);

    if (filteredResults.length > 0 && !romanizedVer) {
      // Pass the first native version to the dynamic multi-language synthesizer
      const nativeVer = filteredResults[0];
      try {
        const { synthesizePhonetic } = await import('./romanize.js');
        const synthesizedVer = await synthesizePhonetic(nativeVer);
        
        if (synthesizedVer) {
           filteredResults.push(synthesizedVer);
        }
      } catch (e) {
        console.error("Failed to auto-romanize lyrics:", e);
      }
    }

    return filteredResults;
  }

  // Fallback to plain lyrics if synced isn't available
  if (data[0].plainLyrics) {
    return [{
      id: data[0].id,
      trackName: data[0].trackName,
      artistName: data[0].artistName,
      syncedLyrics: null,
      plainLyrics: data[0].plainLyrics,
      isNative: /[\uac00-\ud7a3\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(data[0].plainLyrics)
    }];
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
