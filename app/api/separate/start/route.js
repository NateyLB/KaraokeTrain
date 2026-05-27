import { NextResponse } from 'next/server';
import { runWhisper } from '../../../../lib/whisper_runner';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { jobQueue } from '../../../../lib/jobQueue';
import { uploadDirectory, checkCache, uploadJson } from '../../../../lib/storage';
import { isValidVideoId } from '../../../../lib/validators';
import { canStartJob, startJob, finishJob } from '../../../../lib/rateLimiter';

export const maxDuration = 300;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');
  const title = searchParams.get('title') || 'Unknown Title';
  const artist = searchParams.get('artist') || 'Unknown Artist';

  if (!videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: 'A valid YouTube videoId is required' }, { status: 400 });
  }

  // Check cache first!
  const cachedData = await checkCache(videoId);
  if (cachedData) {
    console.log(`Cache hit for ${videoId}!`);
    jobQueue.set(videoId, { 
      status: 'ready', 
      progress: 100, 
      message: 'Ready to sing!', 
      lyrics: cachedData.lyrics, 
      lyricsSource: cachedData.source, 
      fetchedLyricsData: null 
    });
    return NextResponse.json({ job_id: videoId, cached: true });
  }

  if (!canStartJob()) {
    return NextResponse.json({ error: 'Server is busy processing other songs. Please try again shortly.' }, { status: 429 });
  }

  const uploadDir = path.join(process.cwd(), 'uploads', videoId);
  
  try {
    // Ensure uploads directory exists
    fs.mkdirSync(uploadDir, { recursive: true });
    
    // Initialize job status
    jobQueue.set(videoId, { status: 'processing', progress: 0, message: 'Starting job...' });

    // Start background process (fire and forget)
    runBackgroundSeparation({ videoId, title, artist }, videoId, uploadDir).catch(err => {
      console.error("Background separation error:", err);
      const existing = jobQueue.get(videoId);
      if (existing?.status !== 'error') {
        jobQueue.update(videoId, { status: 'error', error: 'Processing failed. Please try again.' });
      }
    });

    // Return immediately to frontend
    return NextResponse.json({ job_id: videoId, cached: false });

  } catch (err) {
    console.error('Failed to start separation:', err);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}

export async function runBackgroundSeparation(song, jobId, uploadDir, baseUrl = 'http://127.0.0.1:3000') {
  const inputPath = path.join(uploadDir, 'input.m4a');

  // SECURITY: Validate videoId strictly before using in any command
  if (!song.videoId || !isValidVideoId(song.videoId)) {
    throw new Error('Invalid videoId format');
  }

  const url = `https://www.youtube.com/watch?v=${song.videoId}`;

  startJob();
  try {
    // 1. Download Audio (SECURITY: Using spawn instead of exec to prevent command injection)
    jobQueue.update(jobId, { message: 'Downloading high-quality audio...' });
    await new Promise((resolve, reject) => {
      const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '-o', inputPath,
        '--no-playlist',       // Never download playlists
        '--max-filesize', '50m', // Limit file size to prevent disk exhaustion
        url
      ]);

      let stderrOutput = '';
      ytdlp.stderr.on('data', (data) => { stderrOutput += data.toString(); });
      ytdlp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}. Error: ${stderrOutput}`));
      });
      ytdlp.on('error', reject);
    });

    // 2. Run Demucs
    jobQueue.update(jobId, { message: 'Loading AI model...' });
    
    await new Promise((resolve, reject) => {
      // Spawn demucs using the python path from env, or fallback to the local venv
      const defaultPythonPath = path.join(process.env.HOME || '', 'Desktop', 'GenAIProjects', 'MusicPractice', 'backend', '.venv', 'bin', 'python3');
      const pythonPath = process.env.PYTHON_BIN_PATH || defaultPythonPath;
      const cmdArgs = ['-m', 'demucs', '--out', uploadDir, '-d', 'cpu', '--two-stems', 'vocals', inputPath];
      const demucsProcess = spawn(pythonPath, cmdArgs);

      let outputLines = [];

      const handleOutput = (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          outputLines.push(trimmed);

          // Parse Progress (tqdm often outputs to stderr)
          const pctMatch = trimmed.match(/(\d{1,3})%\|/);
          if (pctMatch) {
            const rawProgress = parseInt(pctMatch[1], 10);
            const scaledProgress = Math.floor(rawProgress * 0.85); // Save last 15% for Whisper
            jobQueue.update(jobId, { progress: scaledProgress, message: `Separating audio... ${rawProgress}%` });
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
      };

      demucsProcess.stdout.on('data', handleOutput);
      demucsProcess.stderr.on('data', handleOutput);

      demucsProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Demucs exited with code ${code}. Check the UI for details.`));
        }
      });
      
      demucsProcess.on('error', (err) => {
         reject(err);
      });
    });
    
    jobQueue.update(jobId, { message: 'Uploading stems to Cloud Storage...' });
    try {
        await uploadDirectory(path.join(uploadDir, 'htdemucs', 'input'), `processedSongs/${jobId}`);
    } catch(e) {
        console.error("GCS Upload failed:", e);
    }

    // 3. Fetch Lyrics and Run Whisper (All in background!)
    // SECURITY: Always use hardcoded localhost to prevent SSRF via Host header manipulation
    jobQueue.update(jobId, { progress: 85, message: 'Verifying lyrics alignment with Whisper AI...' });
    
    // Fetch lyrics manually using the server endpoint logic
    let plainText = '';
    let fetchedLyricsData = null;
    try {
       const internalBaseUrl = process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
       const lyricsRes = await fetch(`${internalBaseUrl}/api/room?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
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

    // Call Whisper Sync directly
    let finalLyrics = null;
    let finalSource = 'Unknown';
    try {
       const aiData = await runWhisper(jobId, fetchedLyricsData, (whisperPercent) => {
           const scaledProgress = 85 + Math.floor(whisperPercent * 0.15);
           jobQueue.update(jobId, { progress: scaledProgress, message: `Aligning lyrics... ${scaledProgress}%` });
       });
       finalLyrics = aiData.lyrics;
       finalSource = aiData.source;
    } catch(e) {
       console.error("Background Whisper failed", e);
    }

    const metadata = {
        title: song.title,
        artist: song.artist,
        source: finalSource,
        lyrics: finalLyrics
    };

    // Save metadata locally for local-mode caching
    fs.writeFileSync(path.join(uploadDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    
    // Upload metadata to GCS
    try {
        await uploadJson(metadata, `processedSongs/${jobId}/metadata.json`);
    } catch(e) {
        console.error("Metadata upload failed:", e);
    }

    jobQueue.update(jobId, { 
        status: 'ready', 
        progress: 100, 
        message: 'Ready to sing!',
        lyrics: finalLyrics,
        lyricsSource: finalSource,
        fetchedLyricsData: fetchedLyricsData
    });

    // Schedule cleanup of upload directory after 30 minutes
    setTimeout(() => {
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
        console.log(`Cleaned up upload directory: ${jobId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 30 * 60 * 1000);

  } catch (err) {
    jobQueue.update(jobId, { status: 'error', error: 'Processing failed. Please try again.' });
    throw err;
  } finally {
    finishJob();
  }
}
