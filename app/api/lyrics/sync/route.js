import { NextResponse } from 'next/server';
import { runWhisper } from '../../../../lib/whisper_runner';
import { isValidJobId } from '../../../../lib/validators';


export async function POST(request) {
  try {
    const body = await request.json();
    const { jobId, plainLyrics } = body;

    if (!jobId || !isValidJobId(jobId)) {
      return NextResponse.json({ error: 'A valid Job ID is required' }, { status: 400 });
    }

    const result = await runWhisper(jobId, plainLyrics);
    return NextResponse.json(result);

  } catch (err) {
    console.error('Lyrics sync error:', err);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}
