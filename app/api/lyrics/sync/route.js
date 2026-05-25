import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(request) {
  try {
    const body = await request.json();
    const { jobId, plainLyrics } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Path to the separated vocals.wav
    const vocalsPath = path.join(process.cwd(), 'uploads', jobId, 'htdemucs', 'input', 'vocals.wav');
    
    if (!fs.existsSync(vocalsPath)) {
      return Response.json({ error: 'Vocals track not found. Demucs may not be finished.' }, { status: 404 });
    }

    // Spawn Python script using the virtual environment
    const pythonPath = path.join(os.homedir(), 'Desktop', 'GenAIProjects', 'MusicPractice', 'backend', '.venv', 'bin', 'python3');
    const scriptPath = path.join(process.cwd(), 'lib', 'whisper_align.py');

    // Create a temporary file for lyrics text to avoid shell escaping issues with huge strings
    const tmpLyricsFile = path.join(os.tmpdir(), `lyrics_${jobId}.txt`);
    if (plainLyrics) {
      fs.writeFileSync(tmpLyricsFile, plainLyrics);
    }

    const cmdArgs = [scriptPath, '--wav', vocalsPath];
    if (plainLyrics) {
      cmdArgs.push('--lyrics');
      cmdArgs.push(tmpLyricsFile);
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(pythonPath, cmdArgs);
      
      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        console.error(`Whisper stderr: ${data}`);
      });

      pythonProcess.on('close', (code) => {
        // Cleanup temp file
        if (plainLyrics && fs.existsSync(tmpLyricsFile)) {
          fs.unlinkSync(tmpLyricsFile);
        }

        if (code !== 0) {
          return resolve(Response.json({ error: `Whisper exited with code ${code}`, details: stderrData }, { status: 500 }));
        }

        try {
          const alignedLyrics = JSON.parse(stdoutData.trim());
          // If the python script returned the new dictionary format with source
          if (alignedLyrics.source && alignedLyrics.lyrics) {
            return resolve(Response.json({ lyrics: alignedLyrics.lyrics, source: alignedLyrics.source }));
          } else {
            // Fallback for older format if necessary
            return resolve(Response.json({ lyrics: alignedLyrics }));
          }
        } catch (e) {
          return resolve(Response.json({ error: 'Failed to parse python output', details: stdoutData }, { status: 500 }));
        }
      });
    });

  } catch (err) {
    return Response.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
