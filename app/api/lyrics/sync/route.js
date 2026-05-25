import { NextResponse } from 'next/server';
import { runWhisper } from '../../../../lib/whisper_runner';


export async function POST(request) {
  try {
    const body = await request.json();
    const { jobId, plainLyrics } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    const result = await runWhisper(jobId, plainLyrics);
    return NextResponse.json(result);

  } catch (err) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
