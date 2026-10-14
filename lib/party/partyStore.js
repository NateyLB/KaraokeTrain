import { jobQueue } from '../processing/jobQueue.js';
import { REMOTE_COMMANDS, validatedSettings } from './settings.js';
import EventEmitter from 'eventemitter3';
import { assertCurrentSong, assertQueueEntry } from './queueGuards.js';

if (!global.karaokeParties) {
  global.karaokeParties = new Map();
}
if (!global.partyEvents) {
  global.partyEvents = new EventEmitter();
}

const MAX_PARTIES = 200;
const PARTY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity

function rememberCurrentSong(party) {
  if (!party.currentSong) return;
  party.history.push({ ...party.currentSong, playedAt: Date.now() });
  if (party.history.length > 50) party.history.shift();
}

// Periodically purge stale parties to prevent unbounded memory growth
if (!global.karaokePartyCleanup) global.karaokePartyCleanup = setInterval(() => {
  const now = Date.now();
  for (const [id, party] of global.karaokeParties) {
    if (now - party.updatedAt > PARTY_TTL_MS) {
      global.karaokeParties.delete(id);
      console.log(`[PartyStore] Evicted stale party: ${id}`);
    }
  }
}, 5 * 60 * 1000).unref?.(); // Run cleanup every 5 minutes

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
        history: [],
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
    
    const sanitized = validatedSettings(partialSettings);

    party.settings = {
      ...party.settings,
      ...sanitized,
      lastUpdatedBy: sender,
      timestamp: Math.max(Date.now(), (party.settings.timestamp || 0) + 1)
    };
    party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  setRemoteCommand(partyId, action) {
    const party = this.get(partyId);
    // Only allow known command strings
    if (!REMOTE_COMMANDS.has(action)) {
      console.warn(`[PartyStore] Rejected unknown remote command: ${action}`);
      return party;
    }
    party.remoteCommand = { action, timestamp: Math.max(Date.now(), (party.remoteCommand?.timestamp || 0) + 1) };
    party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  addSong(partyId, song) {
    const party = this.get(partyId);
    if (party.queue.length >= 20) {
      const error = new Error('Queue is full (max 20 songs)');
      error.status = 429;
      throw error;
    }
    party.queue.push(song);
    party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  nextSong(partyId, expectedCurrentQueueId) {
    const party = this.get(partyId);
    assertCurrentSong(party, expectedCurrentQueueId);
    
    // Add current song to history before advancing
    rememberCurrentSong(party);
    
    if (party.queue.length > 0) {
      party.currentSong = party.queue.shift();
    } else {
      party.currentSong = null;
    }
    party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
    global.partyEvents.emit(`update:${partyId}`, party);
    return party;
  },

  previousSong(partyId, expectedCurrentQueueId) {
    const party = this.get(partyId);
    assertCurrentSong(party, expectedCurrentQueueId);
    if (party.history.length > 0) {
      if (party.currentSong && party.queue.length >= 20) {
        throw Object.assign(new Error('Queue is full (max 20 songs)'), { status: 429 });
      }
      if (party.currentSong) {
        party.queue.unshift(party.currentSong);
      }
      party.currentSong = party.history.pop();
      party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  },

  removeSong(partyId, index, expectedQueueId) {
    const party = this.get(partyId);
    assertQueueEntry(party.queue, index, expectedQueueId);
    if (index >= 0 && index < party.queue.length) {
      party.queue.splice(index, 1);
      party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  },

  playNow(partyId, index, expectedQueueId) {
    const party = this.get(partyId);
    assertQueueEntry(party.queue, index, expectedQueueId);
    if (index >= 0 && index < party.queue.length) {
      const [song] = party.queue.splice(index, 1);
      
      if (party.currentSong) {
        const currentJob = jobQueue.get(party.currentSong.jobId);
        const isProcessing = currentJob && (currentJob.status === 'processing' || currentJob.status === 'pending');
        
        if (isProcessing) {
          party.queue.unshift(party.currentSong);
        } else rememberCurrentSong(party);
      }
      
      party.currentSong = song;
      party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  },

  reorderSong(partyId, oldIndex, newIndex, expectedQueueId, expectedTargetQueueId) {
    const party = this.get(partyId);
    assertQueueEntry(party.queue, oldIndex, expectedQueueId);
    assertQueueEntry(party.queue, newIndex, expectedTargetQueueId);
    if (oldIndex >= 0 && oldIndex < party.queue.length && newIndex >= 0 && newIndex < party.queue.length) {
      const [movedSong] = party.queue.splice(oldIndex, 1);
      party.queue.splice(newIndex, 0, movedSong);
      party.updatedAt = Math.max(Date.now(), party.updatedAt + 1);
      global.partyEvents.emit(`update:${partyId}`, party);
    }
    return party;
  }
};
