import { jobQueue } from './jobQueue';

if (!global.karaokeParties) {
  global.karaokeParties = new Map();
}

export const partyStore = {
  get(partyId) {
    if (!global.karaokeParties.has(partyId)) {
      global.karaokeParties.set(partyId, {
        id: partyId,
        currentSong: null,
        queue: [], // { jobId, videoId, title, artist, art, status }
        settings: {
           isPlaying: false,
           lyricsOffset: 0,
           vocalsEnabled: true,
           vocalsVolume: 1.0,
           micEnabled: false,
           micVolume: 1.0,
           echoOn: false,
           autoTuneOn: false,
           lastUpdatedBy: null,
           timestamp: 0
        },
        updatedAt: Date.now()
      });
    }
    return global.karaokeParties.get(partyId);
  },
  
  update(partyId, partialData) {
    const existing = this.get(partyId);
    global.karaokeParties.set(partyId, { ...existing, ...partialData, updatedAt: Date.now() });
  },

  updateSettings(partyId, partialSettings, sender) {
    const party = this.get(partyId);
    party.settings = {
      ...party.settings,
      ...partialSettings,
      lastUpdatedBy: sender,
      timestamp: Date.now()
    };
    party.updatedAt = Date.now();
    return party;
  },

  setRemoteCommand(partyId, action) {
    const party = this.get(partyId);
    party.remoteCommand = { action, timestamp: Date.now() };
    party.updatedAt = Date.now();
    return party;
  },

  addSong(partyId, song) {
    const party = this.get(partyId);
    party.queue.push(song);
    party.updatedAt = Date.now();
    return party;
  },

  nextSong(partyId) {
    const party = this.get(partyId);
    if (party.queue.length > 0) {
      party.currentSong = party.queue.shift();
    } else {
      party.currentSong = null;
    }
    party.updatedAt = Date.now();
    return party;
  },

  removeSong(partyId, index) {
    const party = this.get(partyId);
    if (index >= 0 && index < party.queue.length) {
      party.queue.splice(index, 1);
      party.updatedAt = Date.now();
    }
    return party;
  },

  playNow(partyId, index) {
    const party = this.get(partyId);
    if (index >= 0 && index < party.queue.length) {
      const [song] = party.queue.splice(index, 1);
      
      if (party.currentSong) {
        // Only push the currently playing/processing song back to the queue if it's still loading
        const currentJob = jobQueue.get(party.currentSong.jobId);
        const isProcessing = currentJob && (currentJob.status === 'processing' || currentJob.status === 'pending');
        
        if (isProcessing) {
          party.queue.unshift(party.currentSong);
        }
      }
      
      party.currentSong = song;
      party.updatedAt = Date.now();
    }
    return party;
  },

  reorderSong(partyId, oldIndex, newIndex) {
    const party = this.get(partyId);
    if (oldIndex >= 0 && oldIndex < party.queue.length && newIndex >= 0 && newIndex < party.queue.length) {
      const [movedSong] = party.queue.splice(oldIndex, 1);
      party.queue.splice(newIndex, 0, movedSong);
      party.updatedAt = Date.now();
    }
    return party;
  }
};
