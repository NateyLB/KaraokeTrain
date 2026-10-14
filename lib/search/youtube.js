import { decodeEntities } from '../text.js';

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
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${apiKey}&maxResults=10`,
    { signal: AbortSignal.timeout(15000) }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error('YouTube search is temporarily unavailable. Please try again.');
  }

  return (data.items || []).map(item => ({
    id: item.id.videoId,
    title: decodeEntities(item.snippet.title),
    artist: decodeEntities(item.snippet.channelTitle),
    albumArt: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
    videoId: item.id.videoId,
  }));
}
