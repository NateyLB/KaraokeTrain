import { accessEnabled } from '../../../lib/access/server.js';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json({ ok: true, secureAccess: accessEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ok: false }, { status: 503 }); }
}
