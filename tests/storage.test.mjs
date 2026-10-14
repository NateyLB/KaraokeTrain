import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SongStorage } from '../lib/storage/SongStorage.js';

const id = 'abcdefghijk';
test('local cache requires audio, saves metadata atomically, and invalidates the catalog', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'karaoke-storage-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const storage = new SongStorage({ directory });
  await storage.uploadJson({ title: 'First', artist: 'Artist', lyrics: ['large lyrics'] }, `processedSongs/${id}/metadata.json`);
  assert.equal(await storage.checkCache(id), null);
  assert.deepEqual(await storage.getCachedCatalog(), []);
  await fs.writeFile(path.join(directory, id, 'multiplex.m4a'), 'audio');
  await storage.uploadJson({ title: 'Second', artist: 'Artist', lyrics: ['large lyrics'] }, `processedSongs/${id}/metadata.json`);
  assert.equal((await storage.checkCache(id)).title, 'Second');
  const catalog = await storage.getCachedCatalog();
  assert.equal(catalog[0].title, 'Second');
  assert.equal(catalog[0].lyrics, undefined);
  assert.deepEqual((await fs.readdir(path.join(directory, id))).sort(), ['metadata.json', 'multiplex.m4a']);
});

test('cloud errors stay visible rather than causing new processing or local fallback', async () => {
  const storage = new SongStorage({ mode: 'gcs', bucket: { file() { return {
    download: async () => { throw Object.assign(new Error('permission denied'), { code: 403 }); },
    getMetadata: async () => { throw Object.assign(new Error('permission denied'), { code: 403 }); },
  }; } } });
  await assert.rejects(storage.checkCache(id), /permission denied/);
  await assert.rejects(storage.getSavedTranscription(id), /permission denied/);
  await assert.rejects(storage.getFileStream('../invalid', 'multiplex'), /Invalid song ID/);
});

test('cloud catalog bounds downloads, excludes orphan metadata and shares in-flight reads', async () => {
  let active = 0, maximum = 0, lists = 0;
  const ids = Array.from({ length: 24 }, (_, index) => String(index).padStart(11, '0'));
  const names = ids.flatMap(value => [`processedSongs/${value}/metadata.json`, `processedSongs/${value}/multiplex.m4a`]);
  names.push('processedSongs/zzzzzzzzzzz/metadata.json');
  const bucket = {
    getFiles: async () => { lists++; return [names.map(name => ({ name }))]; },
    file: () => ({ download: async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return [Buffer.from(JSON.stringify({ title: 'Song', artist: 'Artist', lyrics: ['omitted'] }))];
    } }),
  };
  const storage = new SongStorage({ mode: 'gcs', bucket });
  const [first, second] = await Promise.all([storage.getCachedCatalog(), storage.getCachedCatalog()]);
  assert.equal(first, second);
  assert.equal(first.length, 24);
  assert.ok(maximum <= 20);
  assert.equal(lists, 1);
  await storage.getCachedCatalog();
  assert.equal(lists, 1);
});
