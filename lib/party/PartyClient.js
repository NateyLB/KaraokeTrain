export class PartyRequestError extends Error {
  constructor(message, status, party) {
    super(message);
    this.name = 'PartyRequestError';
    this.status = status;
    this.party = party;
  }
}

/** Owns the HTTP protocol for party mutations; usable without React. */
export class PartyClient {
  constructor(roomId, request = (...args) => fetch(...args)) {
    this.roomId = roomId;
    this.request = request;
  }

  async send(action, payload = {}, options = {}) {
    const response = await this.request('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action, id: this.roomId }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error('The room service is unavailable. Please try again.'); }
    if (!response.ok) throw new PartyRequestError(data.error || 'Unable to update the room.', response.status, data.party);
    return data;
  }

  addSong(track, options = {}) {
    return this.send('add', {
      song: {
        title: track.title,
        artist: track.artist,
        art: track.albumArt || track.art || '',
        videoId: track.videoId,
      },
    }, options);
  }
}
