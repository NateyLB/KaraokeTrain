import express from 'express';
import { spawn } from 'child_process';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 4000;
const browser = process.env.COOKIES_BROWSER || 'chrome';
const DOWNLOADER_SECRET = process.env.DOWNLOADER_SECRET;

if (!DOWNLOADER_SECRET) {
  console.error('[DOWNLOADER] ❌ FATAL: DOWNLOADER_SECRET env var is not set. Refusing to start without authentication.');
  process.exit(1);
}

app.use((req, res, next) => {
  console.log(`[DOWNLOADER] Incoming request headers:`, req.headers);
  const authHeader = req.headers['authorization'];
  const provided = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!provided) {
    console.warn(`[DOWNLOADER] ⚠️  Missing secret from ${req.ip} — ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Forbidden: Missing secret header' });
  }

  // Prevent timingSafeEqual from throwing an error if lengths differ
  if (provided.length !== DOWNLOADER_SECRET.length) {
    console.warn(`[DOWNLOADER] ⚠️  Secret length mismatch from ${req.ip}. Expected ${DOWNLOADER_SECRET.length}, got ${provided.length}`);
    return res.status(403).json({ error: 'Forbidden: Invalid secret length' });
  }

  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(DOWNLOADER_SECRET))) {
    console.warn(`[DOWNLOADER] ⚠️  Secret value mismatch from ${req.ip}`);
    return res.status(403).json({ error: 'Forbidden: Invalid secret value' });
  }
  
  next();
});

app.get('/download', (req, res) => {
  const videoId = req.query.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
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
  res.setHeader('Transfer-Encoding', 'chunked');

  ytdlp.stdout.pipe(res);

  ytdlp.stderr.on('data', (data) => {
    console.error(`[yt-dlp stderr]: ${data}`);
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error(`[DOWNLOADER] yt-dlp failed with code ${code}`);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      } else {
        res.end(); // End the stream if it already started
      }
    } else {
      console.log(`[DOWNLOADER] Successfully streamed ${videoId}`);
    }
  });

  ytdlp.on('error', (err) => {
    console.error('[DOWNLOADER] Spawn error:', err);
    if (!res.headersSent) {
      res.status(500).send('Spawn error');
    }
  });
});

app.listen(PORT, () => {
  console.log(`[DOWNLOADER] Local Downloader API running on http://localhost:${PORT}`);
  console.log(`[DOWNLOADER] Using ${browser} for cookies.`);
  console.log(`[DOWNLOADER] To expose this server to the internet via Cloudflare Tunnels:`);
  console.log(`[DOWNLOADER] cloudflared tunnel --url http://localhost:${PORT}`);
});
