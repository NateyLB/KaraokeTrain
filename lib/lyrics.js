export async function fetchLyrics(trackName, artistName) {
  // Use LRCLIB's fuzzy 'q' search instead of strict fields. 
  // This behaves exactly like a human typing into the search bar, 
  // bypassing strict string-matching failures for artist names.
  const searchQuery = new URLSearchParams({
    q: `${artistName} ${trackName}`.trim()
  });

  let response = await fetch(`https://lrclib.net/api/search?${searchQuery.toString()}`);
  let data = await response.json();

  // If no match, fallback to just the track name
  if (!response.ok || !data || data.length === 0) {
    console.log(`No match for "${artistName} ${trackName}". Trying broad search...`);
    const broadQuery = new URLSearchParams({
      q: trackName
    });
    response = await fetch(`https://lrclib.net/api/search?${broadQuery.toString()}`);
    data = await response.json();
  }

  if (!response.ok || !data || data.length === 0) {
    console.error('LRCLIB Search Error or no lyrics found');
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
