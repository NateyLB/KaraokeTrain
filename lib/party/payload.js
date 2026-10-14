import { jobQueue } from '../processing/jobQueue.js';

export function partyPayload(party) {
  const withStatus = (song, includeLyrics = false) => {
    const job = jobQueue.get(song.jobId) || { status: 'pending' };
    const { status, progress, message, cached, lyricsRevision, error } = job;
    return { ...song, jobStatus: includeLyrics ? job : { status, progress, message, cached, lyricsRevision, error } };
  };
  return {
    ...party,
    queue: party.queue.map(song => withStatus(song)),
    currentSong: party.currentSong ? withStatus(party.currentSong, true) : null,
  };
}
