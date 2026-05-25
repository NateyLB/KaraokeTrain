import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jobQueue } from '../../../../lib/jobQueue';

const execAsync = promisify(require('child_process').exec);

export const maxDuration = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  const jobId = crypto.randomUUID();
  const uploadDir = path.join(process.cwd(), 'uploads', jobId);
  
  try {
    // Ensure uploads directory exists
    fs.mkdirSync(uploadDir, { recursive: true });
    
    // Initialize job status
    jobQueue.set(jobId, { status: 'processing', progress: 0, message: 'Starting job...' });

    // Start background process (fire and forget)
    runBackgroundSeparation(videoId, jobId, uploadDir).catch(err => {
      console.error("Background separation error:", err);
      const existing = jobQueue.get(jobId);
      if (existing?.status !== 'error') {
        jobQueue.update(jobId, { status: 'error', error: err.message });
      }
    });

    // Return immediately to frontend
    return NextResponse.json({ job_id: jobId });

  } catch (err) {
    console.error('Failed to start separation:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function runBackgroundSeparation(song, jobId, uploadDir) {
  const inputPath = path.join(uploadDir, 'input.m4a');
  const url = `https://www.youtube.com/watch?v=${song.videoId}`;

  try {
    // 1. Download Audio
    jobQueue.update(jobId, { message: 'Downloading high-quality audio...' });
    await execAsync(`yt-dlp -f "bestaudio[ext=m4a]/bestaudio" -o "${inputPath}" "${url}"`);

    // 2. Run Demucs
    jobQueue.update(jobId, { message: 'Loading AI model...' });
    
    await new Promise((resolve, reject) => {
      // Spawn demucs using the python from the user's MusicPractice venv
      const pythonPath = path.join(process.env.HOME, 'Desktop', 'GenAIProjects', 'MusicPractice', 'backend', '.venv', 'bin', 'python3');
      const cmdArgs = ['-m', 'demucs', '--out', uploadDir, '-d', 'cpu', inputPath];
      const demucsProcess = spawn(pythonPath, cmdArgs);

      let outputLines = [];

      demucsProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          outputLines.push(trimmed);

          // Parse Progress
          const pctMatch = trimmed.match(/(\d{1,3})%\|/);
          if (pctMatch) {
            jobQueue.update(jobId, { progress: parseInt(pctMatch[1], 10), message: `Separating... ${pctMatch[1]}%` });
            continue;
          }

          const segMatch = trimmed.match(/Segment\s+(\d+)\s*\/\s*(\d+)/i);
          if (segMatch) {
            const cur = parseInt(segMatch[1], 10);
            const total = parseInt(segMatch[2], 10);
            jobQueue.update(jobId, { message: `Processing segment ${cur}/${total}` });
            continue;
          }
          
          if (trimmed.toLowerCase().includes('download')) {
             jobQueue.update(jobId, { message: 'Downloading Demucs model weights (first time only)...' });
          }
        }
      });

      demucsProcess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) outputLines.push(line);
      });

      demucsProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          const tail = outputLines.slice(-8).join('\n');
          reject(new Error(`Demucs exited with code ${code}. Check the UI for details.`));
        }
      });
      
      demucsProcess.on('error', (err) => {
         reject(err);
      });
    });

    // 3. Fetch Lyrics and Run Whisper (All in background!)
    jobQueue.update(jobId, { message: 'Verifying lyrics alignment with Whisper AI...' });
    
    // Fetch lyrics manually using the server endpoint logic
    let plainText = '';
    let fetchedLyricsData = null;
    try {
       const lyricsRes = await fetch(`http://127.0.0.1:3000/api/room?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
       if (lyricsRes.ok) {
           const data = await lyricsRes.json();
           if (data.lyrics) {
               fetchedLyricsData = data.lyrics;
               if (data.lyrics.syncedLyrics) {
                   plainText = data.lyrics.syncedLyrics.split('\n').map(l => l.replace(/\[.*?\]/, '').trim()).join('\n');
               } else if (data.lyrics.plainLyrics) {
                   plainText = data.lyrics.plainLyrics;
               }
           }
       }
    } catch(e) {
       console.error("Background lyrics fetch failed", e);
    }

    // Call our own Whisper Sync endpoint
    let finalLyrics = null;
    let finalSource = 'Unknown';
    try {
       const aiRes = await fetch(`http://127.0.0.1:3000/api/lyrics/sync`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ jobId: jobId, plainLyrics: plainText })
       });
       
       if (aiRes.ok) {
           const aiData = await aiRes.json();
           finalLyrics = aiData.lyrics;
           finalSource = aiData.source;
       }
    } catch(e) {
       console.error("Background Whisper failed", e);
    }

    jobQueue.update(jobId, { 
        status: 'ready', 
        progress: 100, 
        message: 'Ready to sing!',
        lyrics: finalLyrics,
        lyricsSource: finalSource,
        fetchedLyricsData: fetchedLyricsData // Pass the raw LRCLIB response just in case it needs fallback
    });

  } catch (err) {
    jobQueue.update(jobId, { status: 'error', error: err.message });
    throw err;
  }
}
