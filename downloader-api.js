import express from 'express';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { isValidVideoId } from './lib/http/validators.js';

const app = express();
const PORT = process.env.PORT || 4000;
const DOWNLOADER_SECRET = process.env.DOWNLOADER_SECRET;

if (!DOWNLOADER_SECRET) {
  console.error('[DOWNLOADER] ❌ FATAL: DOWNLOADER_SECRET env var is not set. Refusing to start without authentication.');
  process.exit(1);
}

app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  const provided = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!provided) {
    console.warn(`[DOWNLOADER] ⚠️  Missing secret from ${req.ip} — ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Forbidden: Missing secret header' });
  }

  // Prevent timingSafeEqual from throwing an error if lengths differ
  const providedBytes = Buffer.from(provided);
  const secretBytes = Buffer.from(DOWNLOADER_SECRET);
  if (providedBytes.length !== secretBytes.length) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret' });
  }

  if (!crypto.timingSafeEqual(providedBytes, secretBytes)) {
    console.warn(`[DOWNLOADER] ⚠️  Secret value mismatch from ${req.ip}`);
    return res.status(403).json({ error: 'Forbidden: Invalid secret value' });
  }
  
  next();
});

app.get('/download', (req, res) => {
  const videoId = req.query.videoId;
  if (!isValidVideoId(videoId)) {
    return res.status(400).send('Invalid videoId');
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`[DOWNLOADER] Starting download for ${videoId}...`);

  const ytdlp = spawn('yt-dlp', [
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '--no-playlist',
    '--max-filesize', '50m',
    '--js-runtimes', 'node',
    '--remote-components', 'ejs:github',
    '-o', '-', // Stream to stdout
    url
  ]);

  // Set response headers to stream audio
  res.setHeader('Content-Type', 'audio/mp4');

  // Wait for the process result before ending the response. Otherwise an
  // empty/failed download can be returned as a successful audio stream.
  ytdlp.stdout.pipe(res, { end: false });

  ytdlp.stderr.on('data', (data) => {
    console.error(`[yt-dlp stderr]: ${data}`);
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error(`[DOWNLOADER] yt-dlp failed with code ${code}`);
      if (!res.headersSent) {
        res.status(502).type('text/plain').send('Download failed');
      } else {
        res.destroy(new Error('Download failed'));
      }
    } else {
      console.log(`[DOWNLOADER] Successfully streamed ${videoId}`);
      res.end();
    }
  });

  ytdlp.on('error', (err) => {
    console.error('[DOWNLOADER] Spawn error:', err);
    if (!res.headersSent) {
      res.status(503).type('text/plain').send('Audio downloader is unavailable');
    } else {
      res.destroy(err);
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) ytdlp.kill('SIGTERM');
  });
});

const server = app.listen(PORT, process.env.DOWNLOADER_HOST || '127.0.0.1', error => {
  if (error) return; // Express 5 forwards listen errors to this callback.
  console.log(`[DOWNLOADER] Local Downloader API running on http://localhost:${PORT}`);
  console.log('[DOWNLOADER] YouTube audio is downloaded with yt-dlp.');
  console.log('[DOWNLOADER] Keep this service private; clients use the authenticated web API.');
});
server.on('error', error => {
  console.error(`[DOWNLOADER] Could not listen on port ${PORT}: ${error.code}`);
  process.exitCode = 1;
});
