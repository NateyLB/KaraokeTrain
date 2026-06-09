'use client';
import { Search, Music, HelpCircle, Mic, MicOff, Circle, Play } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';
import SongQueue from './SongQueue';
import InfoModal from './InfoModal';

/**
 * Fixed-position FAB buttons for search and queue toggle,
 * plus the SongQueue drawer itself.
 */
export default function OverlayButtons({ roomId, showSearchButton = true, context = 'room' }) {
  const { partyState, isSearchOpen, setIsSearchOpen, isQueueOpen, setIsQueueOpen, isInfoOpen, setIsInfoOpen, isMicExpanded, setIsMicExpanded, micEnabled, isRecordingExpanded, setIsRecordingExpanded, isRecording, isControlsVisible, setIsControlsVisible } = useKaraokeStore();

  const currentProcessingSong = partyState?.currentSong && ['pending', 'processing', 'error'].includes(partyState.currentSong.jobStatus?.status);
  const displayQueueLength = (partyState?.queue?.length || 0) + (currentProcessingSong ? 1 : 0);

  return (
    <>
      {!isSearchOpen && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
          
          {/* 0. Toggle Playback Controls */}
          {context === 'room' && (
            <button
              className="hide-on-desktop"
              onClick={() => setIsControlsVisible(!isControlsVisible)}
              title={isControlsVisible ? "Hide Playback Controls" : "Show Playback Controls"}
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: '50%', width: '3rem', height: '3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isControlsVisible ? 'var(--primary-accent)' : 'var(--text-muted)', cursor: 'pointer',
                boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => !isControlsVisible && (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => !isControlsVisible && (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Play size={20} />
            </button>
          )}

          {/* 1. Mic Button */}
          {context === 'room' && (
            <button
              onClick={() => {
                setIsRecordingExpanded(false);
                setIsMicExpanded(!isMicExpanded);
              }}
              title="Microphone Panel"
              style={{
                background: 'var(--glass-bg)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '50%', width: '3rem', height: '3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: micEnabled ? 'var(--secondary-accent)' : 'var(--text-muted)', cursor: 'pointer',
                boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => !micEnabled && (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => !micEnabled && (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
          )}

          {/* 1.5 Record Button */}
          {context === 'room' && (
            <button
              onClick={() => {
                setIsMicExpanded(false);
                setIsRecordingExpanded(!isRecordingExpanded);
              }}
              title="Recording Panel"
              style={{
                background: 'var(--glass-bg)', 
                border: '1px solid var(--glass-border)',
                borderRadius: '50%', width: '3rem', height: '3rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isRecordingExpanded || isRecording ? '#ef4444' : 'var(--text-muted)', cursor: 'pointer',
                boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => !(isRecordingExpanded || isRecording) && (e.currentTarget.style.color = 'white')}
              onMouseLeave={e => !(isRecordingExpanded || isRecording) && (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Circle size={20} fill={isRecording ? "#ef4444" : "none"} color={isRecordingExpanded || isRecording ? "#ef4444" : "currentColor"} />
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
              background: 'var(--glass-bg)', 
              border: '1px solid var(--glass-border)',
              borderRadius: '50%', width: '3rem', height: '3rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isQueueOpen ? 'var(--secondary-accent)' : 'var(--text-muted)', cursor: 'pointer',
              boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)',
              position: 'relative',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => !isQueueOpen && (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => !isQueueOpen && (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Music size={20} />
            {displayQueueLength > 0 && (
              <div style={{
                position: 'absolute', top: '-4px', right: '-4px',
                background: 'var(--primary-accent)', color: 'white',
                fontSize: '0.7rem', fontWeight: 'bold',
                width: '20px', height: '20px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {displayQueueLength}
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
