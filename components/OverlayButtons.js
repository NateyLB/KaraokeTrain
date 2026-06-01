'use client';
import { Search, Music } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';
import SongQueue from './SongQueue';

/**
 * Fixed-position FAB buttons for search and queue toggle,
 * plus the SongQueue drawer itself.
 */
export default function OverlayButtons({ roomId, showSearchButton = true }) {
  const { partyState, isSearchOpen, setIsSearchOpen, isQueueOpen, setIsQueueOpen } = useKaraokeStore();

  return (
    <>
      {!isSearchOpen && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
          {showSearchButton && (
            <button
              onClick={() => setIsSearchOpen(true)}
              title="Search Songs"
              style={{
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: '50%', width: '3rem', height: '3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', cursor: 'pointer',
                boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
              }}
            >
              <Search size={20} />
            </button>
          )}
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            title="Toggle Queue"
            style={{
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
              borderRadius: '50%', width: '3rem', height: '3rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--secondary-accent)', cursor: 'pointer',
              boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
              position: 'relative',
            }}
          >
            <Music size={20} />
            {partyState?.queue?.length > 0 && (
              <div style={{
                position: 'absolute', top: '-4px', right: '-4px',
                background: 'var(--primary-accent)', color: 'white',
                fontSize: '0.7rem', fontWeight: 'bold',
                width: '20px', height: '20px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {partyState.queue.length}
              </div>
            )}
          </button>
        </div>
      )}
      <SongQueue roomId={roomId} />
    </>
  );
}
