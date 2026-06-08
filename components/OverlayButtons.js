'use client';
import { Search, Music, HelpCircle, Mic, MicOff } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';
import SongQueue from './SongQueue';
import InfoModal from './InfoModal';

/**
 * Fixed-position FAB buttons for search and queue toggle,
 * plus the SongQueue drawer itself.
 */
export default function OverlayButtons({ roomId, showSearchButton = true, context = 'room' }) {
  const { partyState, isSearchOpen, setIsSearchOpen, isQueueOpen, setIsQueueOpen, isInfoOpen, setIsInfoOpen, isMicExpanded, setIsMicExpanded, micEnabled } = useKaraokeStore();

  return (
    <>
      {!isSearchOpen && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
          
          {/* 1. Mic Button */}
          {context === 'room' && (
            <button
              onClick={() => setIsMicExpanded(!isMicExpanded)}
              title="Microphone Settings"
              style={{
                background: micEnabled ? 'rgba(236, 72, 153, 0.9)' : 'var(--glass-bg)', 
                border: `1px solid ${micEnabled ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
                borderRadius: '50%', width: '3rem', height: '3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: micEnabled ? 'white' : 'var(--text-muted)', cursor: 'pointer',
                boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => !micEnabled && (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => !micEnabled && (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          )}

          {/* 2. Search Button */}
          {context === 'room' && showSearchButton && (
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

          {/* 3. Queue Button */}
          {['room', 'room-empty'].includes(context) && (
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
          )}

          {/* 4. Info Button */}
          <button
            onClick={() => setIsInfoOpen(!isInfoOpen)}
            title="Help & Info"
            style={{
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
              borderRadius: '50%', width: '3rem', height: '3rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', cursor: 'pointer',
              boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <HelpCircle size={20} />
          </button>
        </div>
      )}
      <SongQueue roomId={roomId} />
      <InfoModal context={context} />
    </>
  );
}
