import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { runLyricsEngine } from '../lyrics/engine.js';
import { saveLyricsResult } from '../lyrics/results.js';
import { jobQueue } from './jobQueue.js';
import { uploadFile } from '../storage/index.js';
import { isValidVideoId } from '../http/validators.js';
import { runProcess } from './processRunner.js';

export async function processSong(song) {
  const jobId = song.videoId;
  // SECURITY: Validate videoId strictly before using in any command
  if (!song.videoId || !isValidVideoId(song.videoId)) {
    throw new Error('Invalid videoId format');
  }
  const uploadDir = path.join(process.cwd(), 'uploads', jobId);
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const inputPath = path.join(uploadDir, 'input.m4a');
  const url = `https://www.youtube.com/watch?v=${song.videoId}`;

  try {
    // 1. Download Audio
    jobQueue.update(jobId, { message: 'Downloading high-quality audio...' });
    if (process.env.DOWNLOADER_API_URL) {
      const response = await fetch(`${process.env.DOWNLOADER_API_URL}/download?videoId=${song.videoId}`, {
        headers: { Authorization: `Bearer ${process.env.DOWNLOADER_SECRET || ''}` },
        signal: AbortSignal.timeout(3 * 60 * 1000),
      });
      if (!response.ok || !response.body) throw new Error(`Downloader returned HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(inputPath));
    } else {
      await runProcess('yt-dlp', ['-f', 'bestaudio[ext=m4a]/bestaudio', '-o', inputPath,
        '--no-playlist', '--max-filesize', '50m', '--js-runtimes', 'node',
        '--remote-components', 'ejs:github', '--force-overwrites', url], { timeoutMs: 3 * 60 * 1000 });
    }
    if (!(await fs.promises.stat(inputPath)).size) throw new Error('Downloaded audio is empty');

    // 2. Run Demucs
    jobQueue.update(jobId, { message: 'Loading AI model...' });

    const venvPython = path.join(/* turbopackIgnore: true */ process.cwd(), 'venv', 'bin', 'python3');
    const python = process.env.PYTHON_BIN_PATH || (fs.existsSync(/* turbopackIgnore: true */ venvPython) ? venvPython : 'python3');
    const handleOutput = text => {
      const match = text.match(/(\d{1,3})%\|/);
      if (match) {
        const percent = Math.min(100, Number(match[1]));
        jobQueue.update(jobId, { progress: Math.floor(percent * 0.85), message: `Separating audio... ${percent}%` });
      }
    };
    await runProcess(python, ['-m', 'demucs', '--out', uploadDir, '--two-stems', 'vocals', inputPath], {
      timeoutMs: 30 * 60 * 1000, onStdout: handleOutput, onStderr: handleOutput,
    });

    // --- 2.5. Multiplex into single stereo file ---
    jobQueue.update(jobId, { message: 'Multiplexing audio streams (syncing)...' });
    const htdemucsDir = path.join(uploadDir, 'htdemucs', 'input');
    const vocalsWav = path.join(htdemucsDir, 'vocals.wav');
    const noVocalsWav = path.join(htdemucsDir, 'no_vocals.wav');
    const multiplexM4a = path.join(uploadDir, 'multiplex.m4a');

    await runProcess('ffmpeg', ['-v', 'error', '-y', '-i', noVocalsWav, '-i', vocalsWav,
      '-filter_complex', '[0:a]pan=1c|c0=0.5*c0+0.5*c1[m0]; [1:a]pan=1c|c0=0.5*c0+0.5*c1[m1]; [m0][m1]amerge=inputs=2[a]',
      '-map', '[a]', '-c:a', 'aac', '-b:a', '256k', multiplexM4a], { timeoutMs: 3 * 60 * 1000 });

    jobQueue.update(jobId, { message: 'Uploading multiplexed track to Cloud Storage...' });
    await uploadFile(multiplexM4a, `processedSongs/${jobId}/multiplex.m4a`);

    // 3. Verify candidate lyrics against the independent performance transcript.
    jobQueue.update(jobId, { progress: 85, message: 'Verifying lyrics against the performance...' });

    const { fetchLyrics } = await import('../lyrics/candidates.js');
    let candidates = null;
    try { candidates = await fetchLyrics(song.title, song.artist); }
    catch (error) { console.error('Lyrics candidate lookup failed:', error); }

    let result;
    try {
      result = await runLyricsEngine(jobId, candidates, percent => {
        const progress = 85 + Math.floor(percent * 0.15);
        jobQueue.update(jobId, { progress, message: `Aligning lyrics... ${progress}%` });
      });
    } catch (error) {
      console.error('Lyrics transcription failed:', error);
      result = { lyrics: [], source: 'unavailable', lyricsEngineVersion: 3,
        validation: { reason: 'transcription_failed', independentTranscription: false } };
    }
    const metadata = await saveLyricsResult(jobId, { title: song.title, artist: song.artist }, result);
    jobQueue.update(jobId, { status: 'ready', progress: 100, message: 'Ready to sing!',
      lyrics: metadata.lyrics, lyricsSource: metadata.source, lyricsRevision: metadata.lyricsRevision });

    // Schedule cleanup of upload directory after 30 minutes
    if (process.env.STORAGE_MODE === 'gcs') setTimeout(() => {
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
        console.log(`Cleaned up upload directory: ${jobId}`);
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 30 * 60 * 1000).unref?.();

  } catch (err) {
    console.error("Pipeline Error:", err);
    throw err;
  }
}
