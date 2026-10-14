'use client';

import LyricsDisplay from '../LyricsDisplay';
import LyricsUnavailable from './LyricsUnavailable';
import useKaraokeStore from '../../store/useKaraokeStore';

export default function RoomLyrics() {
  const lyrics = useKaraokeStore(state => state.parsedLyrics);
  const time = useKaraokeStore(state => state.currentSongTime);
  const offset = useKaraokeStore(state => state.lyricsOffset);
  const source = useKaraokeStore(state => state.lyricsSource);
  const videoVisible = useKaraokeStore(state => state.isVideoVisible);
  const jobId = useKaraokeStore(state => state.currentJobId);
  return (
    <div className="lyrics-container" style={{ marginTop: videoVisible ? '0' : '2rem' }}>
      {lyrics.length > 0 && <>
        {process.env.NODE_ENV === 'development' && <div className="lyrics-source">Source: {source}</div>}
        <LyricsDisplay lyrics={lyrics} currentTime={Math.max(0, time - (Number(offset) || 0))} />
      </>}
      {lyrics.length === 0 && <LyricsUnavailable key={jobId} />}
    </div>
  );
}
