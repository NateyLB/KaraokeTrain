/** Routes supply validated songs; storage and execution are injected adapters. */
export class SongProcessingService {
  #requests = new Map();

  constructor({ scheduler, checkCache, processSong, jobs, reportError = console.error }) {
    Object.assign(this, { scheduler, checkCache, processSong, jobs, reportError });
  }

  start(song) {
    const key = song.videoId;
    if (this.#requests.has(key)) return this.#requests.get(key);
    const request = this.#prepare(song);
    this.#requests.set(key, request);
    // Clear failed admission and cache hits; running work keeps its reservation.
    request.then(result => { if (result.cached) this.#requests.delete(key); }, () => this.#requests.delete(key));
    return request;
  }

  async #prepare(song) {
    const jobId = song.videoId;
    const cached = await this.checkCache(jobId);
    if (cached) {
      this.jobs.set(jobId, {
        status: 'ready', cached: true, progress: 100, message: 'Ready to sing!',
        lyrics: cached.lyrics, lyricsSource: cached.source, lyricsRevision: cached.lyricsRevision,
      });
      return { job_id: jobId, cached: true };
    }

    // submit reserves synchronously; every route uses the same scheduler.
    const completion = this.scheduler.submit(`song:${jobId}`, async () => {
      this.jobs.update(jobId, { status: 'processing', message: 'Starting job...' });
      try {
        await this.processSong(song);
      } catch (error) {
        this.reportError('Song processing failed:', error);
        this.jobs.update(jobId, { status: 'error', error: 'Processing failed. Please try again.' });
      } finally {
        this.#requests.delete(jobId);
      }
    });
    this.jobs.set(jobId, { status: 'pending', progress: 0, message: 'Waiting for a processing slot...' });
    // An operation failure is recorded in the job, without an unhandled rejection.
    completion.catch(error => this.reportError('Processing scheduler failed:', error));
    return { job_id: jobId, cached: false };
  }
}
