"use client";

import { useShallow } from 'zustand/react/shallow';
import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../../components/room/Room.module.css';
import RoomLyrics from '../../../components/room/RoomLyrics';
import RoomEmptyState from '../../../components/room/RoomEmptyState';
import RoomSearchPanel from '../../../components/room/RoomSearchPanel';
import NowPlayingHeader from '../../../components/NowPlayingHeader';
import PlayerControls from '../../../components/PlayerControls';
import VideoPlayer from '../../../components/VideoPlayer';
import MicrophonePanel from '../../../components/MicrophonePanel';
import RecordingPanel from '../../../components/RecordingPanel';
import OverlayButtons from '../../../components/OverlayButtons';
import { useAudioPlayback } from '../../../hooks/useAudioPlayback';
import { useSongLoader } from '../../../hooks/useSongLoader';
import { usePartySync } from '../../../hooks/usePartySync';
import { usePartyActions } from '../../../hooks/usePartyActions';
import useKaraokeStore from '../../../store/useKaraokeStore';
import { songSessionKey } from '../../../lib/songLoading';

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const roomId = unwrappedParams.id.toUpperCase();

  // === Hooks ===
  const {
    togglePlay, handleNextSong, handlePreviousSong, handleSeek, handleAlignStart,
    handleYouTubeStateChange, registerMultiplexAudio, ytPlayerRef,
  } = useAudioPlayback(roomId);

  useSongLoader(roomId);

  usePartySync(roomId, 'host', {
    onTogglePlay: togglePlay,
    onNextSong: handleNextSong,
    onPreviousSong: handlePreviousSong,
    onAlignStart: handleAlignStart,
  });

  const {
    partyState, stems,
    isSearchOpen, setIsSearchOpen, hostUrl, setHostUrl,
    setDuration, isControlsVisible, loadingStatus,
  } = useKaraokeStore(useShallow(state => ({
    partyState: state.partyState,
    stems: state.stems,
    isSearchOpen: state.isSearchOpen,
    setIsSearchOpen: state.setIsSearchOpen,
    hostUrl: state.hostUrl,
    setHostUrl: state.setHostUrl,
    setDuration: state.setDuration,
    isControlsVisible: state.isControlsVisible,
    loadingStatus: state.loadingStatus
  })));

  // Reset sensitive states when entering a new room
  useEffect(() => {
    useKaraokeStore.getState().setMicEnabled(false);
    useKaraokeStore.getState().setIsRecording(false);
  }, [roomId]);

  useEffect(() => { 
    setHostUrl(window.location.host); 
  }, [roomId, setHostUrl]);

  // === Queue handler ===
  const { addSong } = usePartyActions(roomId);
  const handleQueueSong = async track => {
    const party = await addSong(track);
    if (party) setIsSearchOpen(false);
    return party;
  };

  const song = partyState?.currentSong;
  
  const jobStatus = partyState?.currentSong?.jobStatus?.status;
  const isCurrentSongNotReady = partyState?.currentSong && (jobStatus === 'pending' || jobStatus === 'processing' || jobStatus === 'error');

  // === EMPTY STATE ===
  if (partyState?.id !== roomId || !partyState.currentSong || isCurrentSongNotReady) {
    return <RoomEmptyState roomId={roomId} hostUrl={hostUrl} partyState={partyState} isCurrentSongNotReady={isCurrentSongNotReady} onQueueSong={handleQueueSong} />;
  }

  // === MAIN KARAOKE VIEW ===
  return (
    <div className={styles.room} style={{ '--controls-medium-space': isControlsVisible ? '8rem' : '1rem', '--controls-large-space': isControlsVisible ? '6rem' : '1rem' }}>


      <OverlayButtons roomId={roomId} showSearchButton={true} />

      {isSearchOpen && <RoomSearchPanel onClose={() => setIsSearchOpen(false)} onQueueSong={handleQueueSong} />}

      <NowPlayingHeader song={song} onBack={() => router.push('/')} />

      {/* Hidden audio element (Multiplex Stereo) */}
      <div style={{ display: 'none' }}>
        {stems?.multiplex && (
          <audio
            key={`${songSessionKey(song)}:${stems.multiplex}`}
            ref={registerMultiplexAudio}
            src={stems.multiplex}
            crossOrigin="anonymous"
            preload="auto"
            onLoadedMetadata={(e) => setDuration(e.target.duration)}
            onCanPlay={() => {
              const state = useKaraokeStore.getState();
              state.setLoadingStatus('');
              state.setIsLoading(false);
            }}
            onError={() => {
              const state = useKaraokeStore.getState();
              state.setIsPlaying(false);
              state.setIsLoading(false);
              state.setLoadingStatus('Error: Could not load the saved audio. Please retry or choose another song.');
            }}
          />
        )}
      </div>

      <div className="main-content-area">
        {song && song.jobId && (
          <VideoPlayer key={songSessionKey(song)} videoId={song.jobId} ytPlayerRef={ytPlayerRef} onStateChange={handleYouTubeStateChange} />
        )}

        <RoomLyrics />
      </div>

      <div style={{ display: isControlsVisible ? 'block' : 'none' }}>
        {loadingStatus && <p role={loadingStatus.startsWith('Error:') ? 'alert' : 'status'} style={{ textAlign: 'center', color: loadingStatus.startsWith('Error:') ? '#ef4444' : 'var(--text-muted)' }}>{loadingStatus}</p>}
        <PlayerControls onAlignStart={handleAlignStart} onTogglePlay={togglePlay} onNextSong={handleNextSong} onPreviousSong={handlePreviousSong} onSeek={handleSeek} />
      </div>

      <MicrophonePanel />
      <RecordingPanel />
    </div>
  );
}
