import { getCachedCatalog } from '../../../lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const catalog = await getCachedCatalog();
    
    // Sort catalog somewhat intelligently (e.g., alphabetically or by newest, 
    // but we only have title/artist currently, no timestamps without file stat)
    // Let's sort alphabetically by artist, then title.
    catalog.sort((a, b) => {
      const artistCompare = (a.artist || '').localeCompare(b.artist || '');
      if (artistCompare !== 0) return artistCompare;
      return (a.title || '').localeCompare(b.title || '');
    });

    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 1 minute on CDN to prevent excessive GCS lists
        'Cache-Control': 's-maxage=60, stale-while-revalidate=120'
      }
    });
  } catch (error) {
    console.error('Failed to fetch catalog:', error);
    return Response.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  }
}
