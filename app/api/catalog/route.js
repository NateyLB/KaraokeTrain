import { getCachedCatalog } from '../../../lib/storage/index';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const catalog = await getCachedCatalog();
    
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
    return Response.json({ error: 'Saved songs are temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
