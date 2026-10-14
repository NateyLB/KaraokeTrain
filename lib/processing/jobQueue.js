import EventEmitter from 'eventemitter3';

if (!global.demucsJobEvents) global.demucsJobEvents = new EventEmitter();

if (!global.demucsJobs) {
  global.demucsJobs = new Map();
}

export const jobQueue = {
  get(jobId) {
    return global.demucsJobs.get(jobId);
  },
  
  set(jobId, data) {
    global.demucsJobs.set(jobId, data);
    global.demucsJobEvents.emit('update', jobId);
  },
  
  update(jobId, partialData) {
    const existing = global.demucsJobs.get(jobId) || {};
    global.demucsJobs.set(jobId, { ...existing, ...partialData });
    global.demucsJobEvents.emit('update', jobId);
  },

  subscribe(listener) {
    global.demucsJobEvents.on('update', listener);
    return () => global.demucsJobEvents.off('update', listener);
  }
};
