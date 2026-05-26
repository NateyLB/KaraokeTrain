import { NextResponse } from 'next/server';
import { runWhisper } from '../../../../lib/whisper_runner';
import { isValidJobId } from '../../../../lib/validators';
import { checkCache, uploadJson } from '../../../../lib/storage';
import path from 'path';
import fs from 'fs';


export async function POST(request) {
  try {
    const body = await request.json();
    const { jobId, plainLyrics } = body;

    if (!jobId || !isValidJobId(jobId)) {
      return NextResponse.json({ error: 'A valid Job ID is required' }, { status: 400 });
    }

    const result = await runWhisper(jobId, plainLyrics);
    
    // Cache the fallback results so we don't have to run Whisper again next time
    if (result && result.lyrics) {
      const existingMetadata = await checkCache(jobId) || { title: 'Unknown', artist: 'Unknown' };
      existingMetadata.lyrics = result.lyrics;
      existingMetadata.source = result.source;
      
      const uploadDir = path.join(process.cwd(), 'uploads', jobId);
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, 'metadata.json'), JSON.stringify(existingMetadata, null, 2));
      
      try {
        await uploadJson(existingMetadata, `processedSongs/${jobId}/metadata.json`);
      } catch(e) {
        console.error("Failed to upload fallback metadata to GCS:", e);
      }
    }

    return NextResponse.json(result);

  } catch (err) {
    console.error('Lyrics sync error:', err);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}
