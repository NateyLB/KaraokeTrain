export function GET() {
  return Response.json({ service: 'karaoke-web', protocol: 1 }, { headers: { 'Cache-Control': 'no-store' } });
}
