import { jobQueue } from './jobQueue';
import EventEmitter from 'eventemitter3';

if (!global.karaokeParties) {
  global.karaokeParties = new Map();
}
if (!global.partyEvents) {
  global.partyEvents = new EventEmitter();
}

const MAX_PARTIES = 200;
const PARTY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity

// Allowed settings keys — anything not on this list gets silently dropped
const ALLOWED_SETTINGS_KEYS = new Set([
  'isPlaying', 'lyricsOffset', 'vocalsEnabled', 'vocalsVolume',
  'micEnabled', 'micVolume', 'echoOn', 'autoTuneOn', 'isVideoVisible'
]);

// Periodically purge stale parties to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [id, party] of global.karaokeParties) {
    if (now - party.updatedAt > PARTY_TTL_MS) {
      global.karaokeParties.delete(id);
      console.log(`[PartyStore] Evicted stale party: ${id}`);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

export const partyStore = {
  get(partyId) {
    if (!global.karaokeParties.has(partyId)) {
      // Enforce max party count before creating a new one
      if (global.karaokeParties.size >= MAX_PARTIES) {
        // Evict the oldest party to make room
        let oldestId = null;
        let oldestTime = Infinity;
        for (const [id, party] of global.karaokeParties) {
          if (party.updatedAt < oldestTime) {
            oldestTime = party.updatedAt;
            oldestId = id;
          }
        }
        if (oldestId) {
          global.karaokeParties.delete(oldestId);
          console.log(`[PartyStore] Evicted oldest party to make room: ${oldestId}`);
        }
      }

      global.karaokeParties.set(partyId, {
        id: partyId,
        currentSong: null,
        queue: [],
        settings: {
           isPlaying: false,
           lyricsOffset: 0,
           vocalsEnabled: true,
           vocalsVolume: 1.0,
           micEnabled: false,
           micVolume: 1.0,
           echoOn: false,
           autoTuneOn: false,
           isVideoVisible: true,
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
    const updated = { ...existing, ...partialData, updatedAt: Date.now() };
    global.karaokeParties.set(partyId, updated);
    global.partyEvents.emit(`update:${partyId}`, updated);
  },

  updateSettings(partyId, partialSettings, sender) {
    const party = this.get(partyId);
    
    // Only allow known settings keys through — drop everything else
    const sanitized = {};
    for (const key of Object.keys(partialSettings)) {
      if (ALLOWED_SETTINGS_KEYS.has(key)) {
        sanitized[key] = partialSettings[key];
      }
    }

    party.settings = {
      ...party.settings,
      ...sanitized,
      lastUpdatedBy: sender,
      timestamp: Date.now()
    };
    party.updatedAt = Date.now();
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  setRemoteCommand(partyId, action) {
    const party = this.get(partyId);
    // Only allow known command strings
    const allowedCommands = ['togglePlay', 'nextSong', 'alignStart', 'toggleMic', 'toggleVideo'];
    if (!allowedCommands.includes(action)) {
      console.warn(`[PartyStore] Rejected unknown remote command: ${action}`);
      return party;
    }
    party.remoteCommand = { action, timestamp: Date.now() };
    party.updatedAt = Date.now();
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  addSong(partyId, song) {
    const party = this.get(partyId);
    party.queue.push(song);
    party.updatedAt = Date.now();
    global.partyEvents.emit(`update:${partyId}`, party);
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
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  removeSong(partyId, index) {
    const party = this.get(partyId);
    if (index >= 0 && index < party.queue.length) {
      party.queue.splice(index, 1);
      party.updatedAt = Date.now();
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  },

  playNow(partyId, index) {
    const party = this.get(partyId);
    if (index >= 0 && index < party.queue.length) {
      const [song] = party.queue.splice(index, 1);
      
      if (party.currentSong) {
        const currentJob = jobQueue.get(party.currentSong.jobId);
        const isProcessing = currentJob && (currentJob.status === 'processing' || currentJob.status === 'pending');
        
        if (isProcessing) {
          party.queue.unshift(party.currentSong);
        }
      }
      
      party.currentSong = song;
      party.updatedAt = Date.now();
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  },

  reorderSong(partyId, oldIndex, newIndex) {
    const party = this.get(partyId);
    if (oldIndex >= 0 && oldIndex < party.queue.length && newIndex >= 0 && newIndex < party.queue.length) {
      const [movedSong] = party.queue.splice(oldIndex, 1);
      party.queue.splice(newIndex, 0, movedSong);
      party.updatedAt = Date.now();
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  }
};
