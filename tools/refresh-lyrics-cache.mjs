import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { checkCache, getCachedCatalog, getSavedTranscription } from '../lib/storage/index.js';
import { metadataHash } from '../lib/lyrics/cacheMaintenance.js';
import { sanitizeForLog } from '../lib/http/validators.js';

const { values } = parseArgs({ options: {
  prepare: { type: 'boolean', default: false }, analyze: { type: 'boolean', default: false }, run: { type: 'string' },
  server: { type: 'string', default: 'http://localhost:3000' }, limit: { type: 'string' },
} });
const root = fileURLToPath(new URL('../', import.meta.url));
if (values.prepare) {
  if (values.run || values.limit || values.analyze) throw new Error('--prepare creates a fresh backup; do not combine it with --run, --analyze or --limit.');
  const catalog = await getCachedCatalog();
  const directory = path.join(root, 'uploads', '.lyric-refresh', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(path.dirname(directory), { recursive: true });
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog, null, 2));
  const inventory = new Array(catalog.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, catalog.length) }, async () => {
    while (next < catalog.length) {
      const index = next++, song = catalog[index];
      try {
        const [metadata, transcript] = await Promise.all([checkCache(song.videoId), getSavedTranscription(song.videoId)]);
        if (!metadata) throw new Error('Cached audio or metadata is missing.');
        const target = path.join(directory, song.videoId);
        await fs.mkdir(target);
        await fs.writeFile(path.join(target, 'metadata.before.json'), JSON.stringify(metadata));
        await fs.writeFile(path.join(target, 'transcription.before.json'), JSON.stringify(transcript));
        inventory[index] = { ...song, source: metadata.source, engineVersion: metadata.lyricsEngineVersion,
          revision: metadata.lyricsRevision, provider: transcript?.provider, transcriptVersion: transcript?.version,
          timingVersion: transcript?.timingVersion, timingAccepted: transcript?.timingValidation?.accepted,
          timingFailure: transcript?.timingValidation?.reason === 'timing_pass_failed', hasTranscript: !!transcript };
      } catch (error) { inventory[index] = { ...song, error: error.message }; }
    }
  }));
  const summary = { run: directory, total: inventory.length, sources: {}, errors: inventory.filter(row => row.error) };
  for (const song of inventory) summary.sources[song.source || '(missing)'] = (summary.sources[song.source || '(missing)'] || 0) + 1;
  await fs.writeFile(path.join(directory, 'inventory.json'), JSON.stringify(inventory, null, 2));
  await fs.writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  if (!summary.errors.length) await fs.writeFile(path.join(directory, 'READY'), 'All catalog entries backed up.\n');
  console.log(JSON.stringify(summary));
  process.exit(summary.errors.length ? 1 : 0);
}
const run = path.resolve(values.run || '');
const runId = path.basename(run);
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (!values.run || !run.startsWith(path.join(root, 'uploads', '.lyric-refresh') + path.sep) ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(runId) || !(limit >= 1 && (limit === Infinity || Number.isInteger(limit)))) {
  throw new Error('Supply --run uploads/.lyric-refresh/RUN_ID and an optional positive --limit.');
}
const inventory = JSON.parse(await fs.readFile(path.join(run, 'inventory.json'), 'utf8'));
if (inventory.some(song => song.error)) throw new Error('The snapshot has backup errors; prepare a fresh snapshot before processing.');
const journalPath = path.join(run, 'results.json');
let journal;
try { journal = JSON.parse(await fs.readFile(journalPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; journal = { version: 1, runId, entries: {}, startedAt: new Date().toISOString() }; }
if (journal.runId !== runId) throw new Error('The journal belongs to another run.');
const lockPath = path.join(run, '.lock');
try {
  const prior = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  let alive = true;
  try { process.kill(prior.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error; }
  if (alive) throw new Error(`This refresh is already running as process ${prior.pid}.`);
  await fs.rm(lockPath);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const lock = await fs.open(lockPath, 'wx');
await lock.writeFile(JSON.stringify({ pid: process.pid, runId }));
await lock.close();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; console.log('Stopping after the current song finishes.'); });

async function checkpoint() {
  journal.updatedAt = new Date().toISOString();
  const entries = Object.values(journal.entries);
  journal.counts = { done: entries.filter(row => row.status === 'done').length,
    analyzed: entries.filter(row => row.status === 'analyzed').length,
    review: entries.filter(row => row.status === 'review').length, failed: entries.filter(row => row.status === 'failed').length,
    total: inventory.length };
  const temporary = `${journalPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(journal, null, 2));
  await fs.rename(temporary, journalPath);
}

const priority = song => song.timingFailure ? -1 : song.source?.startsWith('lrclib') ? 1 : song.source === 'qwen_transcription' ? 2 : 0;
let attempted = 0;
try {
  journal.status = 'running';
  await checkpoint();
  for (const song of [...inventory].sort((a, b) => priority(a) - priority(b))) {
    if (journal.entries[song.videoId]?.status === 'done') continue;
    if (values.analyze && journal.entries[song.videoId]?.status === 'analyzed') continue;
    if (stopping || attempted >= limit) break;
    try { await fs.access(path.join(run, 'STOP')); stopping = true; break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    attempted++;
    const entry = journal.entries[song.videoId] = { title: song.title, status: 'running', startedAt: new Date().toISOString() };
    await checkpoint();
    console.log(`START ${song.videoId} ${sanitizeForLog(song.title)}`);
    try {
      const before = JSON.parse(await fs.readFile(path.join(run, song.videoId, 'metadata.before.json'), 'utf8'));
      let current = await checkCache(song.videoId);
      if (!current) throw new Error('Saved audio or metadata disappeared.');
      let report;
      if (current.lyricsMaintenance?.runId === runId) {
        report = current.lyricsMaintenance; // Recover a response lost after publication.
      } else {
        if (metadataHash(current) !== metadataHash(before)) throw new Error('Metadata changed since backup; held to avoid overwriting a newer edit.');
        for (let attempt = 0; ; attempt++) {
          const response = await fetch(new URL('/api/lyrics/sync', values.server), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: song.videoId, mode: 'refresh-cache', runId,
              analyzeOnly: values.analyze, expectedMetadataHash: metadataHash(before) }),
            signal: AbortSignal.timeout(35 * 60 * 1000),
          });
          const data = await response.json();
          if (response.status === 429 && attempt < 5) { console.log('Waiting for processing admission…'); await delay(60000); continue; }
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.error || 'Refresh failed'}`);
          if (!data.maintenance || data.maintenance.runId !== runId) throw new Error('The response did not acknowledge this maintenance run.');
          report = data.maintenance;
          break;
        }
      }
      entry.report = report;
      if (values.analyze || report.action === 'review-required') {
        if (values.analyze && !report.analyzedOnly) throw new Error('The server did not acknowledge analysis-only mode.');
        entry.status = values.analyze ? 'analyzed' : 'review';
        const candidate = path.join(root, 'uploads', song.videoId, 'transcription.json');
        await fs.copyFile(candidate, path.join(run, song.videoId, 'transcription.candidate.json'));
      } else {
        current = await checkCache(song.videoId);
        const transcript = await getSavedTranscription(song.videoId);
        if (current?.lyricsMaintenance?.runId !== runId || transcript?.provider !== 'qwen' || !transcript.independent) {
          throw new Error('The published Qwen result could not be verified in storage.');
        }
        await fs.writeFile(path.join(run, song.videoId, 'metadata.after.json'), JSON.stringify(current));
        await fs.writeFile(path.join(run, song.videoId, 'transcription.after.json'), JSON.stringify(transcript));
        entry.status = 'done';
        entry.revision = current.lyricsRevision;
      }
      console.log(`${entry.status.toUpperCase()} ${song.videoId}: ${report.action}`);
    } catch (error) {
      entry.status = 'failed'; entry.error = error.message;
      console.error(`FAILED ${song.videoId}: ${error.message}`);
    }
    entry.finishedAt = new Date().toISOString();
    await checkpoint();
  }
  const entries = Object.values(journal.entries);
  const counts = { done: entries.filter(row => row.status === 'done').length,
    analyzed: entries.filter(row => row.status === 'analyzed').length,
    review: entries.filter(row => row.status === 'review').length, failed: entries.filter(row => row.status === 'failed').length,
    total: inventory.length };
  journal.counts = counts;
  journal.status = counts.done === inventory.length ? 'complete' : attempted >= limit || stopping ? 'paused' : values.analyze ? 'analyzed' : 'needs-review';
  await checkpoint();
  const rows = inventory.map(song => {
    const entry = journal.entries[song.videoId];
    return `| ${song.title.replaceAll('|', '\\|')} | ${song.videoId} | ${entry?.status || 'pending'} | ${entry?.report?.reason || entry?.report?.action || entry?.error || ''} |`;
  });
  await fs.writeFile(path.join(run, 'REPORT.md'), `# Cached lyrics refresh\n\nRun: ${runId}\n\n${JSON.stringify(counts)}\n\n| Title | Video ID | Status | Result |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`);
  console.log(JSON.stringify({ run, status: journal.status, ...counts }));
  if (counts.failed) process.exitCode = 1;
} finally {
  await fs.rm(lockPath, { force: true });
}
