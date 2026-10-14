import { pipeline } from 'node:stream/promises';
import { parseByteRange } from '../shared/http-range.mjs';

export function stemHandler(bucket) {
  return async (req, res) => {
    const { jobId, stem } = req.query;
    if (typeof jobId !== 'string' || !/^(?:[\w-]{11}|[a-f0-9-]{36})$/.test(jobId) ||
        !['multiplex', 'vocals', 'no_vocals', 'bass', 'drums', 'other', 'metadata.json'].includes(stem)) {
      return res.status(400).send('Invalid jobId or stem');
    }
    try {
      const name = stem === 'metadata.json' ? stem : `${stem}.${stem === 'multiplex' ? 'm4a' : 'wav'}`;
      const file = bucket.file(`processedSongs/${jobId}/${name}`);
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size);
      if (!Number.isSafeInteger(size) || size < 1) return res.status(404).send('Empty or missing stem');
      const range = parseByteRange(req.headers.range, size);
      if (range === false) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      const headers = {
        'Content-Type': stem === 'metadata.json' ? 'application/json' : stem === 'multiplex' ? 'audio/mp4' : 'audio/wav',
        'Content-Length': String(range ? range.end - range.start + 1 : size),
        'Accept-Ranges': 'bytes',
      };
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      res.status(range ? 206 : 200).set(headers);
      if (req.method === 'HEAD') return res.end();
      // Attaches error handlers and tears down GCS on client disconnect.
      await pipeline(file.createReadStream(range || {}), res);
    } catch (error) {
      if (!res.destroyed && !res.headersSent) {
        res.removeHeader('Content-Length');
        res.status(Number(error.code) === 404 ? 404 : 503).send('Unable to stream cached audio');
      } else if (!res.destroyed) res.destroy();
      if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error('[stems]', error.message);
    }
  };
}
