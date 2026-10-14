import { runDJ } from '../../../lib/dj_runner.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof body?.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
    return Response.json({ error: 'Enter a prompt of 1–4000 characters.' }, { status: 400 });
  }
  try {
    return Response.json(await runDJ({
      prompt: body.prompt,
      history: Array.isArray(body.history) ? body.history.slice(-30) : [],
      currentSong: body.currentSong || null,
      queue: Array.isArray(body.queue) ? body.queue.slice(0, 20) : [],
    }));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 503 });
  }
}
