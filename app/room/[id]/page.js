"use client";

import { useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import LyricsDisplay from '../../../components/LyricsDisplay';
import SearchBar from '../../../components/SearchBar';
import NowPlayingHeader from '../../../components/NowPlayingHeader';
import PlayerControls from '../../../components/PlayerControls';
import VideoPlayer from '../../../components/VideoPlayer';
import MicrophonePanel from '../../../components/MicrophonePanel';
import RecordingPanel from '../../../components/RecordingPanel';
import LoadingScreen from '../../../components/LoadingScreen';
import OverlayButtons from '../../../components/OverlayButtons';
import { QrCode } from 'lucide-react';
import { useAudioPlayback } from '../../../hooks/useAudioPlayback';
import { useSongLoader } from '../../../hooks/useSongLoader';
import { usePartySync } from '../../../hooks/usePartySync';
import useKaraokeStore from '../../../store/useKaraokeStore';

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const roomId = unwrappedParams.id.toUpperCase();

  // === Hooks ===
  const {
    togglePlay, handleNextSong, handlePreviousSong, handleSeek, handleAlignStart,
    handleYouTubeStateChange, audioRefs, ytPlayerRef,
  } = useAudioPlayback(roomId);

  useSongLoader(roomId);

  usePartySync(roomId, 'host', {
    onTogglePlay: togglePlay,
    onNextSong: handleNextSong,
    onPreviousSong: handlePreviousSong,
    onAlignStart: handleAlignStart,
  });

  const {
    partyState, stems, isVideoVisible,
    currentSongTime, lyricsOffset, parsedLyrics, lyricsSource,
    isSearchOpen, setIsSearchOpen, hostUrl, setHostUrl,
    setDuration, isControlsVisible,
  } = useKaraokeStore();

  // Synchronously reset sensitive states when entering a new room
  const lastRoomRef = useRef(null);
  if (lastRoomRef.current !== roomId) {
    lastRoomRef.current = roomId;
    useKaraokeStore.getState().setMicEnabled(false);
    useKaraokeStore.getState().setIsRecording(false);
  }

  useEffect(() => { 
    setHostUrl(window.location.host); 
  }, [roomId, setHostUrl]);

  // === Queue handler ===
  const handleQueueSong = async (track) => {
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add', id: roomId,
        song: { title: track.title, artist: track.artist, art: track.albumArt || '', videoId: track.videoId },
      }),
    });
    setIsSearchOpen(false);
  };

  const song = partyState?.currentSong;
  
  const jobStatus = partyState?.currentSong?.jobStatus?.status;
  const isCurrentSongNotReady = partyState?.currentSong && (jobStatus === 'pending' || jobStatus === 'processing' || jobStatus === 'error');

  // === EMPTY STATE ===
  if (!partyState || !partyState.currentSong || isCurrentSongNotReady) {
    return (
      <div style={{ display: 'flex', height: '100dvh', padding: 'clamp(1rem, 5vw, 2rem)', paddingTop: '5rem', position: 'relative', width: '100%', maxWidth: '100vw', boxSizing: 'border-box', overflow: 'hidden' }}>
        <style>{`
          .empty-state-wrapper { flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; width: 100%; height: 100%; }
          .empty-state-search { max-width: 40rem; width: 100%; margin-bottom: 1rem; text-align: left; display: flex; flex-direction: column; flex: 1; min-height: 0; }
          .room-badge {
            display: flex;
            position: fixed;
            top: 1rem;
            left: 1rem;
            background: rgba(139, 92, 246, 0.15);
            border: 1px solid rgba(139, 92, 246, 0.3);
            backdrop-filter: blur(16px);
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            z-index: 50;
            align-items: center;
            column-gap: 0.8rem;
            row-gap: 0.1rem;
            color: var(--text-main);
            font-size: 0.85rem;
            max-width: calc(100vw - 140px);
            flex-wrap: wrap;
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);
          }
          .join-text {
            opacity: 0.8;
            font-size: 0.75rem;
          }
          @media (min-width: 768px) {
            .join-text {
              border-left: 1px solid rgba(255,255,255,0.2);
              padding-left: 0.8rem;
            }
          }
        `}</style>
        <OverlayButtons roomId={roomId} showSearchButton={false} context="room-empty" />
        <div className="room-badge">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
            <span style={{ opacity: 0.7 }}>Room:</span>
            <span style={{ color: 'var(--primary-accent)', fontWeight: '700', letterSpacing: '1px' }}>{roomId}</span>
          </div>
          <div className="join-text">
            Join: <b>{hostUrl}/remote/{roomId}</b>
          </div>
        </div>
        <div className="empty-state-wrapper">
          <div className="empty-state-search">
            <h3 className="heading-2" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {jobStatus === 'error' ? 
                <span style={{color: '#ef4444'}}>Processing failed. Please try another song.</span> :
               (isCurrentSongNotReady || partyState?.queue?.length > 0) ? 
                "Song processing! Add more to the queue" : 
                "Search for a song to begin"}
            </h3>
            <SearchBar onSelect={handleQueueSong} />
          </div>
        </div>
      </div>
    );
  }

  // === MAIN KARAOKE VIEW ===
  return (
    <div className="karaoke-layout" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', paddingTop: '1rem', position: 'fixed', top: 0, left: 0, paddingBottom: '0', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        .main-content-area { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; margin-top: 3.5rem; }
        .controls-area { display: flex; flex-direction: column; width: 100%; align-items: center; gap: 1rem; margin-bottom: 1rem; }
        .video-container { width: 100%; max-width: 900px; margin: 0 auto 0 auto; padding: 0 2.5rem; }
        .lyrics-container { flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; width: 100%; }
        @media (min-width: 768px) {
            .main-content-area { margin-top: 0; }
        }
        @media (orientation: landscape) and (min-width: 600px) and (max-width: 1024px) {
            .karaoke-layout { padding-bottom: ${isControlsVisible ? '8rem' : '1rem'} !important; }
            .main-content-area { flex-direction: row; padding: 0 1rem; gap: 1rem; align-items: stretch; }
            .video-container { flex: 1; max-width: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; }
            .lyrics-container { flex: 1; margin-top: 0 !important; justify-content: center; align-items: center; }
            .controls-area { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--glass-border); padding: 0.5rem 1rem 1rem 1rem; z-index: 40; flex-direction: column; justify-content: center; align-items: center; gap: 0.5rem; margin-bottom: 0; }
            .controls-area button { padding: 0.4rem 0.8rem !important; font-size: 0.8rem !important; }
            .control-buttons-row { flex-wrap: wrap !important; gap: 0.5rem !important; margin-bottom: 0 !important; justify-content: center; width: 100%; }
            .seekbar-row { width: 100%; max-width: 800px; padding: 0 !important; margin: 0 !important; }
        }
        @media (orientation: landscape) and (min-width: 1025px) {
            .karaoke-layout { padding-bottom: ${isControlsVisible ? '6rem' : '1rem'} !important; }
            .main-content-area { flex-direction: row; padding: 0 2rem; gap: 2rem; align-items: stretch; }
            .video-container { flex: 1; max-width: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; }
            .lyrics-container { flex: 1; margin-top: 0 !important; justify-content: center; align-items: center; }
            .controls-area { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--glass-border); padding: 1rem 2rem; z-index: 40; flex-direction: row; justify-content: space-between; align-items: center; gap: 1.5rem; margin-bottom: 0; }
            .controls-area button { padding: 0.5rem 1rem !important; font-size: 0.9rem !important; }
            .control-buttons-row { flex-wrap: nowrap !important; gap: 0.5rem !important; margin-bottom: 0 !important; }
            .seekbar-row { flex: 1; padding: 0 !important; margin: 0 !important; }
        }
        .responsive-youtube-iframe { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; border-radius: 0.5rem; }
      `}</style>

      <OverlayButtons roomId={roomId} showSearchButton={true} />

      {isSearchOpen && (
        <div style={{ height: '80vh', maxHeight: '80vh', minHeight: '300px', display: 'flex', flexDirection: 'column', padding: '0 2rem', marginBottom: '1rem', zIndex: 10, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
            <h3 className="heading-2" style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-muted)' }}>Search YouTube</h3>
            <button onClick={() => setIsSearchOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>✕</span>
            </button>
          </div>
          <SearchBar onSelect={(s) => { handleQueueSong(s); setIsSearchOpen(false); }} />
        </div>
      )}

      <NowPlayingHeader song={song} onBack={() => router.push('/')} />

      {/* Hidden audio element (Multiplex Stereo) */}
      <div style={{ display: 'none' }}>
        {stems?.multiplex && (
          <audio
            ref={el => audioRefs.current['multiplex'] = el}
            src={stems.multiplex}
            preload="auto"
            crossOrigin="anonymous"
            onLoadedMetadata={(e) => setDuration(e.target.duration)}
          />
        )}
      </div>

      <div className="main-content-area">
        {song && song.jobId && (
          <VideoPlayer videoId={song.jobId} ytPlayerRef={ytPlayerRef} onStateChange={handleYouTubeStateChange} />
        )}

        <div className="lyrics-container" style={{ marginTop: isVideoVisible ? '0' : '2rem' }}>
          {parsedLyrics.length > 0 && (
            <>
              {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
                <div style={{ position: 'absolute', top: 0, right: '1rem', background: 'var(--glass-bg)', padding: '0.25rem 0.75rem', borderRadius: 'var(--border-radius-full)', fontSize: '0.75rem', color: 'var(--text-muted)', zIndex: 10, border: '1px solid var(--glass-border)' }}>
                  Source: {lyricsSource}
                </div>
              )}
              <LyricsDisplay lyrics={parsedLyrics} currentTime={Math.max(0, currentSongTime - (Number(lyricsOffset) || 0))} />
            </>
          )}
        </div>
      </div>

      <div style={{ display: isControlsVisible ? 'block' : 'none' }}>
        <PlayerControls onTogglePlay={togglePlay} onNextSong={handleNextSong} onPreviousSong={handlePreviousSong} onSeek={handleSeek} />
      </div>

      <MicrophonePanel />
      <RecordingPanel />
    </div>
  );
}
