import { NextResponse } from 'next/server';
import { runWhisper } from '../../../../lib/whisper_runner';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { jobQueue } from '../../../../lib/jobQueue';
import { uploadFile, uploadDirectory, checkCache, uploadJson } from '../../../../lib/storage';
import { isValidVideoId } from '../../../../lib/validators';
import { canStartJob, startJob, finishJob, checkRateLimit, getClientIp } from '../../../../lib/rateLimiter';

export const maxDuration = 300;

export async function POST(request) {
  // Rate limit: max 5 separation requests per minute per IP
  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(`separate:${clientIp}`, { maxRequests: 5, windowMs: 60000 });
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many processing requests. Please slow down.' }, { status: 429 });
  }

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

    // Extract baseUrl to ensure internal fetches route properly in Cloud Run
    const baseUrl = process.env.INTERNAL_BASE_URL || new URL(request.url).origin;

    // Start background process (fire and forget)
    runBackgroundSeparation({ videoId, title, artist }, videoId, uploadDir, baseUrl).catch(err => {
      console.error("Background separation error:", err);
      const existing = jobQueue.get(videoId);
      if (existing?.status !== 'error') {
        jobQueue.update(videoId, { status: 'error', error: err.message || 'Processing failed. Please try again.' });
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
  // SECURITY: Validate videoId strictly before using in any command
  if (!song.videoId || !isValidVideoId(song.videoId)) {
    throw new Error('Invalid videoId format');
  }

  // Check GCS Cache First!
  const cachedData = await checkCache(song.videoId);
  if (cachedData) {
    console.log(`Cache hit for ${song.videoId}! Skipping separation.`);
    jobQueue.update(jobId, { 
      status: 'ready', 
      progress: 100, 
      message: 'Ready to sing!', 
      lyrics: cachedData.lyrics, 
      lyricsSource: cachedData.source, 
      fetchedLyricsData: null 
    });
    return; // Exit early!
  }

  const inputPath = path.join(uploadDir, 'input.m4a');
  const url = `https://www.youtube.com/watch?v=${song.videoId}`;

  startJob();
  try {
    // 1. Download Audio
    jobQueue.update(jobId, { message: 'Downloading high-quality audio...' });
    await new Promise(async (resolve, reject) => {
      try {
        if (process.env.DOWNLOADER_API_URL) {
          console.log(`[Cloud Run] Fetching from Local Downloader API: ${process.env.DOWNLOADER_API_URL}/download?videoId=${song.videoId}`);
          const res = await fetch(`${process.env.DOWNLOADER_API_URL}/download?videoId=${song.videoId}`, {
            headers: { 'Authorization': `Bearer ${process.env.DOWNLOADER_SECRET || ''}` }
          });
          if (!res.ok) {
            throw new Error(`Downloader API returned ${res.status}: ${await res.text()}`);
          }
          
          const writeStream = fs.createWriteStream(inputPath);
          const nodeStream = Readable.fromWeb(res.body);
          
          nodeStream.pipe(writeStream);
          nodeStream.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('finish', () => {
            const stats = fs.statSync(inputPath);
            if (stats.size === 0) reject(new Error('Downloaded file is 0 bytes'));
            else resolve();
          });

        } else {
          // Fallback to local yt-dlp execution (SECURITY: Using spawn to prevent command injection)
          const ytdlpArgs = [
            '-f', 'bestaudio[ext=m4a]/bestaudio',
            '-o', inputPath,
            '--no-playlist',
            '--max-filesize', '50m',
            '--js-runtimes', 'node',
            '--remote-components', 'ejs:github',
            '--force-overwrites',
            url
          ];

          const ytdlp = spawn('yt-dlp', ytdlpArgs);

          let stderrOutput = '';
          let stdoutOutput = '';
          ytdlp.stdout.on('data', (data) => { stdoutOutput += data.toString(); });
          ytdlp.stderr.on('data', (data) => { stderrOutput += data.toString(); });
          ytdlp.on('close', (code) => {
            if (code === 0) {
              try {
                const stats = fs.statSync(inputPath);
                if (stats.size === 0) {
                  reject(new Error(`yt-dlp exited with code 0 but created a 0-byte file.`));
                } else {
                  resolve();
                }
              } catch (e) {
                reject(new Error(`yt-dlp failed to create file.`));
              }
            } else {
              reject(new Error(`yt-dlp exited with code ${code}. Error: ${stderrOutput}`));
            }
          });
          ytdlp.on('error', reject);
        }
      } catch (err) {
        reject(err);
      }
    });

    // 2. Run Demucs
    jobQueue.update(jobId, { message: 'Loading AI model...' });
    
    await new Promise((resolve, reject) => {
      // Spawn demucs using the python path from env, or fallback to the local venv
      const pythonPath = process.env.PYTHON_BIN_PATH || 'python3';
      // Auto-detect local virtual environment for better developer experience
      const venvPythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
      const pythonExec = fs.existsSync(venvPythonPath) ? venvPythonPath : pythonPath;
      
      const cmdArgs = ['-m', 'demucs', '--out', uploadDir, '--two-stems', 'vocals', inputPath];
      
      const demucsProcess = spawn(pythonExec, cmdArgs);

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
          const lastLines = outputLines.slice(-5).join('\n');
          reject(new Error(`Demucs exited with code ${code}. Error: ${lastLines}`));
        }
      });
      
      demucsProcess.on('error', (err) => {
         reject(err);
      });
    });

    // --- 2.5. Multiplex into single stereo file ---
    jobQueue.update(jobId, { message: 'Multiplexing audio streams (syncing)...' });
    const htdemucsDir = path.join(uploadDir, 'htdemucs', 'input');
    const vocalsWav = path.join(htdemucsDir, 'vocals.wav');
    const noVocalsWav = path.join(htdemucsDir, 'no_vocals.wav');
    const multiplexM4a = path.join(uploadDir, 'multiplex.m4a');

    await new Promise((resolve, reject) => {
      // Left channel = noVocals (Instrumental), Right channel = vocals
      const ffmpegArgs = [
        '-y',
        '-i', noVocalsWav,
        '-i', vocalsWav,
        '-filter_complex', '[0:a]pan=1c|c0=0.5*c0+0.5*c1[m0]; [1:a]pan=1c|c0=0.5*c0+0.5*c1[m1]; [m0][m1]amerge=inputs=2[a]',
        '-map', '[a]',
        '-c:a', 'aac',
        '-b:a', '256k',
        multiplexM4a
      ];
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';
      ffmpeg.stderr.on('data', (d) => stderr += d.toString());
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg failed with code ${code}. Error: ${stderr}`));
      });
      ffmpeg.on('error', reject);
    });
    
    jobQueue.update(jobId, { message: 'Uploading multiplexed track to Cloud Storage...' });
    try {
        await uploadFile(multiplexM4a, `processedSongs/${jobId}/multiplex.m4a`);
    } catch(e) {
        console.error("GCS Upload failed:", e);
    }

    // 3. Fetch Lyrics and Run Whisper (All in background!)
    // SECURITY: Always use hardcoded localhost to prevent SSRF via Host header manipulation
    jobQueue.update(jobId, { progress: 85, message: 'Verifying lyrics alignment with Whisper AI...' });
    
    // Fetch lyrics manually using the direct internal function
    let plainText = '';
    let fetchedLyricsData = null;
    try {
       // We import fetchLyrics here to avoid circular dependencies at the top level
       const { fetchLyrics } = await import('../../../../lib/lyrics.js');
       
       // LRCLIB search handles its own cascade of raw vs cleaned titles now
       try {
         fetchedLyricsData = await fetchLyrics(song.title, song.artist);
       } catch (err) {
         console.error('Initial LRCLIB search error:', err);
       }
       
       if (fetchedLyricsData) {
           if (fetchedLyricsData.syncedLyrics) {
               plainText = fetchedLyricsData.syncedLyrics.split('\n').map(l => l.replace(/\[.*?\]/, '').trim()).join('\n');
           } else if (fetchedLyricsData.plainLyrics) {
               plainText = fetchedLyricsData.plainLyrics;
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
    console.error("Pipeline Error:", err);
    jobQueue.update(jobId, { status: 'error', error: err.message || 'Processing failed. Please try again.' });
    throw err;
  } finally {
    finishJob();
  }
}
