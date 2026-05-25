import { searchYouTube } from '../../../lib/youtube';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  try {
    const tracks = await searchYouTube(query);
    return Response.json(tracks);
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ error: 'Failed to search YouTube' }, { status: 500 });
  }
}
