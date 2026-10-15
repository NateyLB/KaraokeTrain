import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { parseLRC } from './candidates.js';
import { getFileStream } from '../storage/index.js';
import { pipeline } from 'stream/promises';
import { runProcess } from '../processing/processRunner.js';

if (!global.lyricsJobs) global.lyricsJobs = new Map();

export function runLyricsEngine(jobId, lyricsData, onProgress = null, options = {}) {
  if (global.lyricsJobs.has(jobId)) return global.lyricsJobs.get(jobId);
  const work = runEngine(jobId, lyricsData, onProgress, options)
    .finally(() => global.lyricsJobs.delete(jobId));
  global.lyricsJobs.set(jobId, work);
  return work;
}

export function formatLyrics(lyricsData) {
  if (!lyricsData) return [];
  const versions = Array.isArray(lyricsData) ? lyricsData : [lyricsData];
  if (versions.every(version => version?.text)) return [{ label: 'Original', lines: versions }];
  return versions.filter(Boolean).map(version => {
    const text = typeof version === 'string' ? version : version.plainLyrics;
    const lines = Array.isArray(version.lines) ? version.lines : version.syncedLyrics ? parseLRC(version.syncedLyrics) :
      (text || '').split(/\r?\n/).map(line => ({ text: line.trim() })).filter(line => line.text);
    return { id: version.id, trackName: version.trackName, artistName: version.artistName,
      derivedFrom: version.derivedFrom, exactMatch: version.exactMatch, cached: version.cached,
      label: version.label || (version.isNative ? 'Original (Native)' : 'Original'),
      isKorean: /[\uac00-\ud7a3]/.test(lines.map(line => line.text).join(' ')), lines };
  }).filter(version => version.lines.length);
}

async function runEngine(jobId, lyricsData, onProgress = null, { transcription } = {}) {
  const uploadDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'uploads', jobId);
  const vocalsPath = path.join(uploadDir, 'htdemucs', 'input', 'vocals.wav');
  const transcriptPath = path.join(uploadDir, 'transcription.json');
  fs.mkdirSync(uploadDir, { recursive: true });
  const localTranscript = fs.existsSync(transcriptPath) ? JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) : null;
  if (transcription?.independent && transcription.version >= 2 &&
    (!localTranscript?.independent || transcription.version >= localTranscript.version)) {
    fs.writeFileSync(transcriptPath, JSON.stringify(transcription));
  }
  const provider = process.env.LYRICS_ASR_PROVIDER || 'qwen';
  const cached = fs.existsSync(transcriptPath) ? JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) : null;
  const reusable = cached?.independent && (provider === 'qwen' ? cached.provider === 'qwen' && cached.version === 3 : cached.version === 2);
  const needsTimingPass = provider === 'qwen' && !cached?.timingVersion;
  if ((!reusable || needsTimingPass) && !fs.existsSync(vocalsPath)) {
    // Cached multiplex files preserve isolated vocals on the right channel.
    // Recover them directly instead of downloading YouTube or rerunning Demucs.
    const multiplexPath = path.join(uploadDir, 'multiplex.m4a');
    if (!fs.existsSync(multiplexPath)) {
      const audio = await getFileStream(jobId, 'multiplex');
      if (!audio) throw new Error('Saved song audio is unavailable.');
      const temporary = `${multiplexPath}.${randomUUID()}.tmp`;
      try {
        await pipeline(audio.createReadStream(), fs.createWriteStream(temporary));
        fs.renameSync(temporary, multiplexPath);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
    fs.mkdirSync(path.dirname(vocalsPath), { recursive: true });
    await runProcess('ffmpeg', ['-v', 'error', '-y', '-i', multiplexPath,
      '-af', 'pan=mono|c0=c1', '-ar', '16000', '-c:a', 'pcm_s16le', vocalsPath], { timeoutMs: 3 * 60 * 1000 });
  }
  const environment = provider === 'qwen' ? 'venv-asr' : 'venv';
  const venvPython = path.join(/* turbopackIgnore: true */ process.cwd(), environment, 'bin', 'python3');
  const pythonPath = (provider === 'qwen' ? process.env.ASR_PYTHON_BIN_PATH : process.env.PYTHON_BIN_PATH) ||
    (fs.existsSync(/* turbopackIgnore: true */ venvPython) ? venvPython : 'python3');
  const scriptPath = path.join(process.cwd(), 'lib', 'lyrics', 'lyrics_worker.py');
  const lyricsFilePath = path.join(uploadDir, `lyrics-${randomUUID()}.json`);
  fs.writeFileSync(lyricsFilePath, JSON.stringify(formatLyrics(lyricsData)));
  const args = [scriptPath, '--lyrics_file', lyricsFilePath, '--transcript_file', transcriptPath];
  if (fs.existsSync(vocalsPath)) args.push('--wav', vocalsPath);
  const originalMix = path.join(uploadDir, 'input.m4a');
  if (fs.existsSync(originalMix)) args.push('--original_mix', originalMix);
  const execute = async (executable, workerArgs, progressScale) => {
    const { stdout } = await runProcess(executable, workerArgs, {
      maxOutput: 16 * 1024 * 1024,
      onStderr: text => {
        for (const match of text.matchAll(/PROGRESS:(\d+)/g)) onProgress?.(progressScale(Number(match[1])));
      },
    });
    const result = JSON.parse(stdout.trim());
    if (!Array.isArray(result.lyrics)) throw new Error('Invalid lyrics result');
    return result;
  };
  try {
    let result = await execute(pythonPath, args, percent => provider === 'qwen' ? Math.floor(percent*.65) : percent);
    if (provider === 'qwen' && !result.transcription?.timingVersion) {
      const timingPython = process.env.PYTHON_BIN_PATH || path.join(/* turbopackIgnore: true */ process.cwd(), 'venv','bin','python3');
      const worker = path.join(process.cwd(),'lib','lyrics','timing_worker.py');
      try {
        result = await execute(timingPython, [worker,'--wav',vocalsPath,'--lyrics_file',lyricsFilePath,'--transcript_file',transcriptPath],
          percent => 65 + Math.floor(percent*.35));
      } catch (error) {
        console.error('Word timing refinement unavailable:', error.message);
        result.transcription.timingValidation = { accepted:false, reason:'timing_pass_failed' };
      }
    }
    return result;
  } finally {
    fs.rmSync(lyricsFilePath, { force:true });
  }
}
