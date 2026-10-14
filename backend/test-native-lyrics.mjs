// Run from web/: node ../backend/test-native-lyrics.mjs
// Uses two seconds of synthesized silence, an ephemeral HTTP server, and the
// real web Whisper runner. No song/audio/transcript files are written.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runWhisper } from '../web/lib/whisper_runner.js';

const samples = 16000 * 2;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
  res.end(wav);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const result = await runWhisper('synthetic-silence', null, null, {
    audioURL: `http://127.0.0.1:${server.address().port}/vocals.wav`, duration: 2,
  });
  assert.deepEqual(result.lyrics, []);
  assert.equal(result.source, 'whisper_fallback');
  console.log('PASS: real Whisper loaded streamed audio and returned valid empty lyrics for silence.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
