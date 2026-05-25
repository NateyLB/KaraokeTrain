/**
 * Searches YouTube for songs matching a query.
 * Returns a list of video results with metadata.
 */
export async function searchYouTube(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing YouTube API Key in environment variables.');
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${apiKey}&maxResults=10`
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('YouTube Search Error:', data);
    return [];
  }

  return (data.items || []).map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    albumArt: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    videoId: item.id.videoId,
  }));
}

/**
 * Searches YouTube specifically for karaoke/instrumental versions of a track.
 */
export async function searchYouTubeKaraoke(trackName, artistName) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing YouTube API Key in environment variables.');
  }

  const query = `${trackName} ${artistName} karaoke instrumental`;

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${apiKey}&maxResults=3`
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('YouTube Karaoke Search Error:', data);
    return null;
  }

  if (data.items && data.items.length > 0) {
    const video = data.items[0];
    return {
      videoId: video.id.videoId,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.high.url,
    };
  }

  return null;
}
