/** Keep expensive lyric work alive independently of an edge HTTP deadline. */
export class RepairJobs {
  #jobs = new Map();
  constructor(now = Date.now) { this.now = now; }
  start(id, operation) {
    for (const [key, job] of this.#jobs) if (job.status !== 'processing' && this.now() - job.startedAt > 60 * 60 * 1000) this.#jobs.delete(key);
    const previous = this.#jobs.get(id);
    if (previous?.status === 'processing') return this.status(id);
    if (!previous && this.#jobs.size >= 100) throw Object.assign(new Error('The repair queue is full.'), { status: 429 });
    const job = { status: 'processing', startedAt: this.now() };
    this.#jobs.set(id, job);
    Promise.resolve().then(operation).then(result => {
      job.result = result; job.status = 'ready';
    }, error => {
      job.error = error.status === 404 ? 'Processed song not found.' : 'Lyrics could not be updated. Please retry.';
      job.status = 'error';
    });
    return this.status(id);
  }
  status(id) {
    const job = this.#jobs.get(id);
    return job ? { jobId: id, status: job.status, result: job.result, error: job.error } : null;
  }
}
