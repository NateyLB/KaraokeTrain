import './runtime-config.mjs';
import { stemHandler } from './stem-stream.mjs';
import express from 'express';
import { spawn } from 'child_process';
import crypto from 'crypto';
import dns from 'dns';
import { nativeSeparationRouter } from './native-separation.js';

// Fix for Node fetch ConnectTimeoutError on networks with unroutable IPv6
dns.setDefaultResultOrder('ipv4first');

import { Storage } from '@google-cloud/storage';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error('[DOWNLOADER] PORT must be an integer between 0 and 65535.');
  process.exit(1);
}
const browser = process.env.COOKIES_BROWSER || 'chrome';
const DOWNLOADER_SECRET = process.env.DOWNLOADER_SECRET;

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'karaoke-stems-lyrics';
const bucket = storage.bucket(bucketName);

if (!DOWNLOADER_SECRET) {
  console.error('[DOWNLOADER] ❌ FATAL: DOWNLOADER_SECRET env var is not set. Refusing to start without authentication.');
  process.exit(1);
}

app.get('/health', (_req, res) => res.set('Cache-Control', 'no-store').json({ service: 'karaoke-downloader', protocol: 1 }));

app.use((req, res, next) => {
  console.log(`[DOWNLOADER] Incoming request: ${req.method} ${req.path}`);
  const authHeader = req.headers['authorization'];
  const provided = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.substring(7)
      : req.query.secret; // Fallback to query parameter for AVPlayer
  
  if (typeof provided !== 'string' || !provided) {
    console.warn(`[DOWNLOADER] ⚠️  Missing secret from ${req.ip} — ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Forbidden: Missing secret header or query param' });
  }

  // Prevent timingSafeEqual from throwing an error if lengths differ
  if (Buffer.byteLength(provided) !== Buffer.byteLength(DOWNLOADER_SECRET)) {
    console.warn(`[DOWNLOADER] ⚠️  Secret length mismatch from ${req.ip}. Expected ${DOWNLOADER_SECRET.length}, got ${provided.length}`);
    return res.status(403).json({ error: 'Forbidden: Invalid secret length' });
  }

  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(DOWNLOADER_SECRET))) {
    console.warn(`[DOWNLOADER] ⚠️  Secret value mismatch from ${req.ip}`);
    return res.status(403).json({ error: 'Forbidden: Invalid secret value' });
  }
  
  next();
});

app.use('/native/jobs', nativeSeparationRouter(bucket, browser));

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
    '--cookies-from-browser', browser,
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

app.get('/checkCache', async (req, res) => {
  const videoId = req.query.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  try {
    // We check if the multiplex stem exists in GCS, as that implies it was successfully processed
    const file = bucket.file(`processedSongs/${videoId}/multiplex.m4a`);
    const [exists] = await file.exists();

    return res.json({ cached: exists });
  } catch (err) {
    console.error(`[DOWNLOADER] GCS cache check error for ${videoId}:`, err.message);
    // A storage outage is not a cache miss: don't trigger expensive processing.
    return res.status(503).json({ error: 'GCS cache is unavailable. Retry after checking server credentials.' });
  }
});

app.get('/stems', stemHandler(bucket));

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${apiKey}&maxResults=15`
    );
    const data = await response.json();

    if (!response.ok) return res.status(response.status).json(data);

    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'),
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      duration: 0
    }));

    res.json(results);
  } catch (err) {
    console.error('[DOWNLOADER] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

const server = app.listen(PORT, '0.0.0.0', error => {
  // Express 5 passes listen errors to this callback; ignoring the argument
  // reported success on EADDRINUSE and exited with status zero.
  if (error) {
    console.error(error.code === 'EADDRINUSE'
      ? `[DOWNLOADER] Port ${PORT} is already in use. Use the running server or stop it before restarting. No second server was started.`
      : `[DOWNLOADER] Cannot start server: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const actualPort = server.address().port;
  console.log(`[DOWNLOADER] Local Downloader API running on http://localhost:${actualPort}`);
  console.log(`[DOWNLOADER] Using ${browser} for cookies.`);
  console.log(`[DOWNLOADER] To expose this server to the internet via Cloudflare Tunnels:`);
  console.log(`[DOWNLOADER] cloudflared tunnel --url http://localhost:${actualPort}`);
});
