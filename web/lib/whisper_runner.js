import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function runWhisper(jobId, lyricsData, onProgress = null, options = {}) {
    // Path to the separated vocals.wav
    const vocalsPath = path.join(process.cwd(), 'uploads', jobId, 'htdemucs', 'input', 'vocals.wav');
    
    if (!options.audioURL && !fs.existsSync(vocalsPath)) {
      throw new Error('Vocals track not found. Demucs may not be finished.');
    }

    const venvPythonPath = path.join(process.cwd(), 'venv', 'bin', 'python3');
    const backendPythonPath = path.resolve(process.cwd(), '..', 'backend', 'venv', 'bin', 'python3');
    const defaultPythonPath = [venvPythonPath, backendPythonPath].find(p => fs.existsSync(p)) || 'python3';
    const pythonPath = process.env.PYTHON_BIN_PATH || defaultPythonPath;
    const scriptPath = path.join(process.cwd(), 'lib', 'whisper_align.py');

    let formattedLyrics = [];
    if (lyricsData) {
        // Ensure lyricsData is always an array to handle multiple versions
        const versions = Array.isArray(lyricsData) ? lyricsData : [lyricsData];
        
        versions.forEach(version => {
            if (!version) return;
            
            let parsedLines = [];
            let isKorean = false;
            
            if (typeof version === 'string') {
                parsedLines = version.split('\n').map(l => ({ text: l.replace(/\[.*?\]/g, '').trim() })).filter(l => l.text);
            } else if (typeof version === 'object') {
                isKorean = version.hasHangul || /[\uac00-\ud7a3]/.test(version.syncedLyrics || version.plainLyrics || '');
                if (version.syncedLyrics) {
                    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
                    const lines = version.syncedLyrics.split('\n');
                    for (const line of lines) {
                        const match = timeRegex.exec(line);
                        if (match) {
                            const minutes = parseInt(match[1], 10);
                            const seconds = parseInt(match[2], 10);
                            const milliseconds = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
                            const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
                            const text = line.replace(timeRegex, '').trim();
                            if (text) {
                                parsedLines.push({ time: timeInSeconds, text });
                            }
                        }
                    }
                } else if (version.plainLyrics) {
                    parsedLines = version.plainLyrics.split('\n').map(l => ({ text: l.trim() })).filter(l => l.text);
                } else if (version.text) {
                    // Pre-parsed line from old array format
                    parsedLines.push(version);
                }
            }
            
            if (parsedLines.length > 0) {
                // If it's a single array format from old code, it pushes multiple single-line "versions".
                // We'll group them if we accidentally get flat array of {text}
                if (version.text) {
                    if (formattedLyrics.length === 0 || formattedLyrics[0].label !== 'Default') {
                        formattedLyrics.push({ label: 'Default', isKorean: false, lines: [] });
                    }
                    formattedLyrics[0].lines.push(version);
                } else {
                    formattedLyrics.push({
                        label: version.label || (isKorean ? 'Korean (Original)' : 'Romanized (English)'),
                        isKorean: isKorean,
                        lines: parsedLines
                    });
                }
            }
        });
        
        // Deduplicate labels if necessary
        let koreanCount = 1;
        let romanizedCount = 1;
        formattedLyrics.forEach(v => {
            if (v.label === 'Korean (Original)' && koreanCount > 1) v.label = `Korean (${koreanCount++})`;
            else if (v.label === 'Korean (Original)') koreanCount++;
            
            if (v.label === 'Romanized (English)' && romanizedCount > 1) v.label = `Romanized (${romanizedCount++})`;
            else if (v.label === 'Romanized (English)') romanizedCount++;
        });
    }

    // Stream lyrics over stdin and GCS audio over HTTP; native jobs need no local files.
    // Keep the authenticated URL out of process arguments and logs.
    const cmdArgs = [scriptPath, '--wav', options.audioURL ? '-' : vocalsPath, '--lyrics_file', '-'];
    if (Number.isFinite(options.duration) && options.duration > 0) {
      cmdArgs.push('--duration', String(options.duration));
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(pythonPath, cmdArgs, {
        env: { ...process.env, ...(options.audioURL ? { KARAOKE_WHISPER_AUDIO_URL: options.audioURL } : {}) },
      });
      const timeout = setTimeout(() => {
        pythonProcess.kill('SIGKILL');
        reject(new Error('Lyric transcription timed out. Audio is still cached; retry lyrics.'));
      }, 20 * 60 * 1000);
      pythonProcess.once('error', error => { clearTimeout(timeout); reject(error); });
      pythonProcess.stdin.on('error', () => {}); // Child failure is handled above/on close.
      pythonProcess.stdin.end(JSON.stringify(formattedLyrics));
      
      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        if (stdoutData.length > 8 * 1024 * 1024) pythonProcess.kill('SIGKILL');
      });

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrData = (stderrData + text).slice(-8000);
        
        // Parse dynamic progress
        const match = text.match(/PROGRESS:(\d+)/);
        if (match && onProgress) {
            onProgress(parseInt(match[1], 10));
        } else {
            console.error(`Whisper stderr: ${options.audioURL ? text.split(options.audioURL).join('[audio stream]') : text}`);
        }
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          const safeError = options.audioURL ? stderrData.split(options.audioURL).join('[audio stream]') : stderrData;
          return reject(new Error(`Whisper exited with code ${code}. Details: ${safeError}`));
        }

        try {
          const alignedLyrics = JSON.parse(stdoutData.trim());
          // If the python script returned the new dictionary format with source
          if (alignedLyrics.source && alignedLyrics.lyrics) {
            return resolve({ lyrics: alignedLyrics.lyrics, source: alignedLyrics.source });
          } else {
            // Fallback for older format if necessary
            return resolve({ lyrics: alignedLyrics, source: 'Unknown' });
          }
        } catch (e) {
          return reject(new Error(`Failed to parse python output. Details: ${stdoutData}`));
        }
      });
    });
}
