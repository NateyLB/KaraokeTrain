import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isValidJobId, isValidStem } from '../http/validators.js';

async function mapLimited(items, concurrency, operation) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && !failed) {
      const index = next++;
      try { results[index] = await operation(items[index]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return results;
}

/** Encapsulates local/GCS paths, JSON persistence, and bounded catalog hydration. */
export class SongStorage {
  #catalog = null;
  #catalogRequest = null;
  #version = 0;

  constructor({ mode = 'local', bucket = null, directory = path.join(process.cwd(), 'uploads') } = {}) {
    Object.assign(this, { mode, bucket, directory });
  }

  #key(id, filename) {
    if (!isValidJobId(id)) throw new TypeError('Invalid song ID');
    return `processedSongs/${id}/${filename}`;
  }
  #cloud() {
    if (this.mode === 'gcs' && !this.bucket) throw new Error('Cloud storage is not configured');
    return this.mode === 'gcs';
  }

  async #readJson(id, filename) {
    const key = this.#key(id, filename);
    const local = path.join(this.directory, id, filename);
    try {
      const contents = this.#cloud() ? (await this.bucket.file(key).download())[0] : await fs.readFile(local);
      return JSON.parse(contents.toString());
    } catch (error) {
      if (error.code === 404 || error.code === 'ENOENT') return null;
      throw error; // storage failures must not masquerade as an unprocessed song
    }
  }

  async checkCache(id) {
    const [metadata, audio] = await Promise.all([this.#readJson(id, 'metadata.json'), this.getFileStream(id, 'multiplex')]);
    return metadata && audio ? metadata : null;
  }
  getSavedTranscription(id) { return this.#readJson(id, 'transcription.json'); }

  async getFileStream(id, stem) {
    if (!isValidStem(stem)) throw new TypeError('Invalid stem');
    const filename = `${stem}.${stem === 'multiplex' ? 'm4a' : 'wav'}`;
    const key = this.#key(id, filename);
    try {
      if (this.#cloud()) {
        const file = this.bucket.file(key);
        const [metadata] = await file.getMetadata();
        return { size: Number(metadata.size), source: 'gcs', createReadStream: options => file.createReadStream(options) };
      }
      const local = stem === 'multiplex' ? path.join(this.directory, id, filename) : path.join(this.directory, id, 'htdemucs', 'input', filename);
      const info = await fs.stat(local);
      return { size: info.size, source: 'local', createReadStream: options => createReadStream(local, options) };
    } catch (error) {
      if (error.code === 404 || error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async uploadFile(localFile, destination) {
    if (this.#cloud()) await this.bucket.upload(localFile, { destination, resumable: true });
  }

  async uploadJson(value, destination) {
    const match = /^processedSongs\/([^/]+)\/(metadata|transcription)\.json$/.exec(destination);
    if (!match) throw new TypeError('Invalid metadata destination');
    const [, id, name] = match;
    this.#key(id, `${name}.json`);
    const directory = path.join(this.directory, id);
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, `${name}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const json = JSON.stringify(value);
    try { await fs.writeFile(temporary, json); await fs.rename(temporary, target); }
    finally { await fs.rm(temporary, { force: true }); }
    if (this.#cloud()) await this.bucket.file(destination).save(json, { contentType: 'application/json' });
    if (name === 'metadata') { this.#version++; this.#catalog = null; }
  }

  async getCachedCatalog() {
    if (this.#catalog?.expires > Date.now()) return this.#catalog.data;
    if (this.#catalogRequest) return this.#catalogRequest;
    const version = this.#version;
    const request = this.#loadCatalog().then(data => {
      if (version === this.#version) this.#catalog = { data, expires: Date.now() + 60000 };
      return data;
    });
    this.#catalogRequest = request;
    try { return await request; }
    finally { if (this.#catalogRequest === request) this.#catalogRequest = null; }
  }

  async #loadCatalog() {
    let ids;
    if (this.#cloud()) {
      const [files] = await this.bucket.getFiles({ prefix: 'processedSongs/' });
      const keys = new Set(files.map(file => file.name));
      ids = files.map(file => /^processedSongs\/([^/]+)\/metadata\.json$/.exec(file.name)?.[1])
        .filter(id => id && isValidJobId(id) && keys.has(`processedSongs/${id}/multiplex.m4a`));
    } else {
      const directory = this.directory;
      try { ids = (await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && isValidJobId(entry.name)).map(entry => entry.name); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    const songs = await mapLimited(ids, 20, async id => {
      try {
        const metadata = this.#cloud() ? await this.#readJson(id, 'metadata.json') : await this.checkCache(id);
        if (!metadata) return null;
        return { videoId: id, title: metadata.title, artist: metadata.artist, source: metadata.source, albumArt: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
      } catch (error) {
        if (error instanceof SyntaxError) { console.error(`Skipping malformed song metadata: ${id}`); return null; }
        throw error;
      }
    });
    return songs.filter(Boolean).sort((a, b) => (a.artist || '').localeCompare(b.artist || '') || (a.title || '').localeCompare(b.title || ''));
  }
}
