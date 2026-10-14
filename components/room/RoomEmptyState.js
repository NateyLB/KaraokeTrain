'use client';

import styles from './RoomEmptyState.module.css';
import SearchBar from '../SearchBar';
import OverlayButtons from '../OverlayButtons';

export default function RoomEmptyState({ roomId, hostUrl, partyState, isCurrentSongNotReady, onQueueSong }) {
  const jobStatus = partyState?.currentSong?.jobStatus?.status;
    return (
      <div style={{ display: 'flex', height: '100dvh', padding: 'clamp(1rem, 5vw, 2rem)', paddingTop: '5rem', position: 'relative', width: '100%', maxWidth: '100vw', boxSizing: 'border-box', overflow: 'hidden' }}>

        <OverlayButtons roomId={roomId} showSearchButton={false} context="room-empty" />
        <div className={styles.badge}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
            <span style={{ opacity: 0.7 }}>Room:</span>
            <span style={{ color: 'var(--primary-accent)', fontWeight: '700', letterSpacing: '1px' }}>{roomId}</span>
          </div>
          <div className={styles.joinText}>
            Join: <b>{hostUrl}/remote/{roomId}</b>
          </div>
        </div>
        <div className={styles.wrapper}>
          <div className={styles.search}>
            <h3 className="heading-2" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {jobStatus === 'error' ?
                <span style={{color: '#ef4444'}}>Processing failed. Please try another song.</span> :
               (isCurrentSongNotReady || partyState?.queue?.length > 0) ?
                "Song processing! Add more to the queue" :
                "Search for a song to begin"}
            </h3>
            <SearchBar onSelect={onQueueSong} />
          </div>
        </div>
      </div>
    );
}
