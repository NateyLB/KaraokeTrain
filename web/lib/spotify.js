export async function getSpotifyAccessToken() {
  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    throw new Error('Missing Spotify credentials in environment variables.');
  }

  const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
    next: { revalidate: 3600 } // Cache token for 1 hour
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Spotify Auth Error:', data);
    throw new Error('Failed to fetch Spotify access token');
  }
  
  return data.access_token;
}

export async function searchSpotifyTracks(query) {
  const token = await getSpotifyAccessToken();
  
  const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Spotify Search Error:', data);
    return [];
  }
  
  return data.tracks.items.map(track => ({
    id: track.id,
    title: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    albumArt: track.album.images[0]?.url,
    durationMs: track.duration_ms,
    previewUrl: track.preview_url
  }));
}
