"use client";

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import LyricsDisplay from '../../../components/LyricsDisplay';
import SearchBar from '../../../components/SearchBar';
import NowPlayingHeader from '../../../components/NowPlayingHeader';
import PlayerControls from '../../../components/PlayerControls';
import VideoPlayer from '../../../components/VideoPlayer';
import MicrophonePanel from '../../../components/MicrophonePanel';
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
    togglePlay, handleNextSong, handleSeek, handleAlignStart,
    handleYouTubeStateChange, audioRefs, ytPlayerRef,
  } = useAudioPlayback(roomId);

  useSongLoader(roomId);

  usePartySync(roomId, 'host', {
    onTogglePlay: togglePlay,
    onNextSong: handleNextSong,
    onAlignStart: handleAlignStart,
  });

  const {
    partyState, stems, isLoading, isVideoVisible,
    currentSongTime, lyricsOffset, parsedLyrics, lyricsSource,
    isSearchOpen, setIsSearchOpen, hostUrl, setHostUrl,
    setDuration,
  } = useKaraokeStore();

  // Set hostUrl on mount
  useEffect(() => { setHostUrl(window.location.host); }, []);

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

  // === EMPTY STATE ===
  if (!partyState || (!partyState.currentSong && !isLoading)) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', padding: '2rem', position: 'relative' }}>
        <OverlayButtons roomId={roomId} showSearchButton={false} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ maxWidth: '40rem', width: '100%', marginBottom: '4rem', textAlign: 'center' }}>
            <h3 className="heading-2" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Search for a song to begin</h3>
            <SearchBar onSelect={handleQueueSong} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <QrCode size={120} color="var(--primary-accent)" style={{ opacity: 0.8, marginBottom: '2rem' }} />
            <h2 className="heading-1 text-gradient" style={{ fontSize: '4rem', letterSpacing: '0.5rem', marginBottom: '1rem' }}>{roomId}</h2>
            <p className="body-text" style={{ fontSize: '1.5rem', opacity: 0.8, marginBottom: '3rem' }}>Join at <b>{hostUrl}/remote/{roomId}</b> to add songs!</p>
          </div>
        </div>
      </div>
    );
  }

  // === LOADING STATE ===
  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', padding: '2rem', position: 'relative' }}>
        <OverlayButtons roomId={roomId} showSearchButton={false} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ maxWidth: '40rem', width: '100%', marginBottom: '4rem', textAlign: 'center' }}>
            <h3 className="heading-2" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Search to add more songs to the queue</h3>
            <SearchBar onSelect={handleQueueSong} />
          </div>
          <LoadingScreen />
        </div>
      </div>
    );
  }

  // === MAIN KARAOKE VIEW ===
  return (
    <div className="karaoke-layout" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', paddingTop: '1rem', position: 'fixed', top: 0, left: 0, paddingBottom: '1rem', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        .main-content-area { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; }
        .controls-area { display: flex; flex-direction: column; width: 100%; align-items: center; gap: 1rem; margin-bottom: 1rem; }
        .video-container { width: 100%; max-width: 900px; margin: 0 auto 1rem auto; padding: 0 2rem; }
        .lyrics-container { flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; width: 100%; }
        @media (orientation: landscape) and (min-width: 600px) {
            .karaoke-layout { padding-bottom: 6rem !important; }
            .main-content-area { flex-direction: row; padding: 0 2rem; gap: 2rem; align-items: stretch; }
            .video-container { flex: 1; max-width: none; margin: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; }
            .lyrics-container { flex: 1; margin-top: 0 !important; }
            .controls-area { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(20px); border-top: 1px solid var(--glass-border); padding: 1rem 2rem; z-index: 40; flex-direction: row; justify-content: space-between; align-items: center; gap: 1.5rem; margin-bottom: 0; }
            .controls-area button { padding: 0.5rem 1rem !important; font-size: 0.9rem !important; }
            .control-buttons-row { flex-wrap: nowrap !important; gap: 0.5rem !important; margin-bottom: 0 !important; }
            .seekbar-row { flex: 1; padding: 0 !important; margin: 0 !important; }
        }
        .responsive-youtube-iframe { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; border-radius: 0.5rem; }
      `}</style>

      <OverlayButtons roomId={roomId} showSearchButton={true} />

      {isSearchOpen && (
        <div style={{ height: '30vh', minHeight: '200px', display: 'flex', flexDirection: 'column', padding: '0 2rem', marginBottom: '1rem', zIndex: 10, position: 'relative' }}>
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

      <PlayerControls onTogglePlay={togglePlay} onNextSong={handleNextSong} onSeek={handleSeek} />

      <div className="main-content-area">
        {song && song.jobId && (
          <VideoPlayer videoId={song.jobId} ytPlayerRef={ytPlayerRef} onStateChange={handleYouTubeStateChange} />
        )}

        <div className="lyrics-container" style={{ marginTop: isVideoVisible ? '0' : '2rem' }}>
          {parsedLyrics.length > 0 && (
            <>
              <div style={{ position: 'absolute', top: 0, right: '1rem', background: 'var(--glass-bg)', padding: '0.25rem 0.75rem', borderRadius: 'var(--border-radius-full)', fontSize: '0.75rem', color: 'var(--text-muted)', zIndex: 10, border: '1px solid var(--glass-border)' }}>
                Source: {lyricsSource}
              </div>
              <LyricsDisplay lyrics={parsedLyrics} currentTime={Math.max(0, currentSongTime - (Number(lyricsOffset) || 0))} />
            </>
          )}
        </div>
      </div>

      <MicrophonePanel />
    </div>
  );
}
