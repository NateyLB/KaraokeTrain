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
        updatedAt: Date.now()
      });
    }
    return global.karaokeParties.get(partyId);
  },
  
  update(partyId, partialData) {
    const existing = this.get(partyId);
    global.karaokeParties.set(partyId, { ...existing, ...partialData, updatedAt: Date.now() });
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
        // Push the currently playing/processing song to the front of the queue so it's not lost
        party.queue.unshift(party.currentSong);
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
