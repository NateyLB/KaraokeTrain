if (!global.demucsJobs) {
  global.demucsJobs = new Map();
}

export const jobQueue = {
  get(jobId) {
    return global.demucsJobs.get(jobId);
  },
  
  set(jobId, data) {
    global.demucsJobs.set(jobId, data);
  },
  
  update(jobId, partialData) {
    const existing = global.demucsJobs.get(jobId) || {};
    global.demucsJobs.set(jobId, { ...existing, ...partialData });
  }
};
