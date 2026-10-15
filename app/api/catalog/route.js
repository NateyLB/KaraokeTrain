import { withAccess } from '../../../lib/access/server.js';
import { getCachedCatalog } from '../../../lib/storage/index';

export const dynamic = 'force-dynamic';

async function handleGET() {
  try {
    const catalog = await getCachedCatalog();
    
    return new Response(JSON.stringify(catalog), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 1 minute on CDN to prevent excessive GCS lists
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('Failed to fetch catalog:', error);
    return Response.json({ error: 'Saved songs are temporarily unavailable. Please try again.' }, { status: 503 });
  }
}

export const GET = withAccess(['owner', 'host', 'guest'], handleGET);
