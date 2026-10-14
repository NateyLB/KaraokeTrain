export class ProcessingBusyError extends Error {
  constructor() {
    super('The processing queue is full. Please try again shortly.');
    this.status = 429;
  }
}

/** Owns admission, deduplication and release for expensive local work. */
export class TaskScheduler {
  #tasks = new Map();
  #pending = [];
  #active = 0;
  #idleWaiters = [];

  constructor({ concurrency = 1, maxPending = 20 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxPending) || maxPending < 0) {
      throw new TypeError('Invalid processing limits');
    }
    this.concurrency = concurrency;
    this.maxPending = maxPending;
  }

  get activeCount() { return this.#active; }
  get pendingCount() { return this.#pending.length; }

  submit(key, operation) {
    if (this.#tasks.has(key)) return this.#tasks.get(key).promise;
    if (this.#active >= this.concurrency && this.#pending.length >= this.maxPending) throw new ProcessingBusyError();

    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    const task = { key, operation, resolve, reject, promise };
    this.#tasks.set(key, task);
    this.#pending.push(task);
    this.#drain();
    return promise;
  }

  whenIdle() {
    if (!this.#active && !this.#pending.length) return Promise.resolve();
    return new Promise(resolve => this.#idleWaiters.push(resolve));
  }

  #drain() {
    while (this.#active < this.concurrency && this.#pending.length) {
      const task = this.#pending.shift();
      this.#active++;
      const finish = (error, value) => {
        this.#active--;
        this.#tasks.delete(task.key);
        this.#drain();
        if (!this.#active && !this.#pending.length) this.#idleWaiters.splice(0).forEach(resolve => resolve());
        if (error) task.reject(error); else task.resolve(value);
      };
      Promise.resolve().then(task.operation).then(value => finish(null, value), error => finish(error));
    }
  }
}
