// Read-only smoke test against the running development services and existing GCS cache.
import '../backend/runtime-config.mjs';
import assert from 'node:assert/strict';

const web = `http://127.0.0.1:${process.env.KARAOKE_WEB_PORT || 3000}`;
const backend = `http://127.0.0.1:${process.env.PORT || 4000}`;
const authorization = `Bearer ${process.env.DOWNLOADER_SECRET}`;
const get = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
for (const [url, service] of [[`${web}/api/health`, 'karaoke-web'], [`${backend}/health`, 'karaoke-downloader']]) {
  const response = await get(url);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, service);
}
assert.equal((await get(web)).status, 200);
assert.equal((await get(`${web}/api/party?id=invalid!`)).status, 400);
const response = await get(`${web}/api/catalog`);
assert.equal(response.status, 200);
const catalog = await response.json();
assert.ok(catalog.length > 0, 'A cached song is needed for this read-only smoke test');
const song = catalog[0];
const videoId = song.videoId || song.id;
assert.match(videoId, /^[\w-]{11}$/);
for (const base of [`${web}/api/stems`, `${backend}/stems`]) {
  const url = `${base}?jobId=${videoId}&stem=multiplex`;
  const head = await get(url, { method: 'HEAD', headers: { authorization } });
  assert.equal(head.status, 200);
  const size = Number(head.headers.get('content-length'));
  assert.ok(size > 64);
  for (const [range, length, expected] of [
    ['bytes=0-1', 2, `bytes 0-1/${size}`],
    ['bytes=-64', 64, `bytes ${size - 64}-${size - 1}/${size}`],
    [`bytes=${size - 2}-`, 2, `bytes ${size - 2}-${size - 1}/${size}`],
    [`bytes=${size - 2}-${size + 10}`, 2, `bytes ${size - 2}-${size - 1}/${size}`],
  ]) {
    const part = await get(url, { headers: { authorization, range } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), expected);
    assert.equal((await part.arrayBuffer()).byteLength, length);
  }
}
const lyrics = await get(`${web}/api/native/lyrics?videoId=${videoId}`, { headers: { authorization } });
assert.equal(lyrics.status, 200);
const result = await lyrics.json();
assert.equal(result.status, 'complete');
assert.ok(Array.isArray(result.lyrics));
console.log(`PASS: both health checks, web home, ${catalog.length}-song catalog, GCS HEAD/ranges on both services, ${result.lyrics.length} cached lyric lines. No GCS writes.`);
