"use client";

import { useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import LyricsDisplay from '../../../components/LyricsDisplay';
import AudioVisualizer from '../../../components/AudioVisualizer';
import SearchBar from '../../../components/SearchBar';
import NowPlayingHeader from '../../../components/NowPlayingHeader';
import PlayerControls from '../../../components/PlayerControls';
import VideoPlayer from '../../../components/VideoPlayer';
import MicrophonePanel from '../../../components/MicrophonePanel';
import SongQueue from '../../../components/SongQueue';
import LoadingScreen from '../../../components/LoadingScreen';
import { parseLRC } from '../../../lib/lyrics';
import { Search, Music, QrCode } from 'lucide-react';
import { useAudioAnalyzer } from '../../../hooks/useAudioAnalyzer';
import { usePartySync } from '../../../hooks/usePartySync';
import useKaraokeStore from '../../../store/useKaraokeStore';

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const roomId = unwrappedParams.id.toUpperCase();

  // === Zustand Store ===
  const store = useKaraokeStore();
  const {
    partyState, setPartyState, currentJobId, setCurrentJobId,
    isPlaying, setIsPlaying, stems, setStems, setDuration,
    currentSongTime, setCurrentSongTime, lyricsOffset, setLyricsOffset,
    vocalsEnabled, vocalsVolume, isVideoVisible, setIsVideoVisible,
    parsedLyrics, setParsedLyrics, guideNotes, setGuideNotes,
    setLyricsSource, isLoading, setIsLoading, loadingStatus, setLoadingStatus,
    isSearchOpen, setIsSearchOpen, isQueueOpen, setIsQueueOpen,
    hostUrl, setHostUrl, echoOn, autoTuneOn,
    resetForNewSong,
  } = store;

  // === Refs (imperative, not in store) ===
  const audioRefs = useRef({ vocals: null, no_vocals: null });
  const setupJobIdRef = useRef(null);
  const prefetchedBlobs = useRef({});
  const timeUpdateInterval = useRef(null);
  const ytPlayerRef = useRef(null);
  const isPlayingRef = useRef(false);

  // === Mic Hook ===
  const { isListening, volume: micVolume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, error: micError } = useAudioAnalyzer();

  // Bridge mic state -> store
  useEffect(() => {
    useKaraokeStore.getState().setMicEnabled(isListening);
  }, [isListening]);

  // Set hostUrl on mount
  useEffect(() => {
    setHostUrl(window.location.host);
  }, []);

  // === Echo sync ===
  useEffect(() => {
    setEchoEnabled(echoOn);
  }, [echoOn, setEchoEnabled]);

  // === AutoTune target pitch ===
  useEffect(() => {
    if (!autoTuneOn || !isListening) {
      setVocoderTargetFrequency(0);
      return;
    }
    if (guideNotes) {
      const activeGuideNote = guideNotes.find(n => currentSongTime >= n.startTime && currentSongTime <= n.endTime);
      if (activeGuideNote) {
        const freq = 440 * Math.pow(2, (activeGuideNote.midi - 69) / 12);
        setVocoderTargetFrequency(freq);
      } else {
        setVocoderTargetFrequency(0);
      }
    }
  }, [currentSongTime, autoTuneOn, guideNotes, isListening, setVocoderTargetFrequency]);

  // === Playback controls ===
  const togglePlay = () => {
    if (!stems) return;
    
    if (isPlaying) {
      Object.values(audioRefs.current).forEach(audio => {
          if (audio) audio.pause();
      });
      if (ytPlayerRef.current) ytPlayerRef.current.pauseVideo();
      clearInterval(timeUpdateInterval.current);
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      const allStems = ['vocals', 'no_vocals'];
      allStems.forEach(stemKey => {
        if (audioRefs.current[stemKey]) {
           if (stemKey === 'vocals') {
             audioRefs.current[stemKey].muted = !vocalsEnabled;
             audioRefs.current[stemKey].volume = vocalsVolume;
           }
        }
      });
      
      setIsPlaying(true);
      isPlayingRef.current = true;
      
      if (ytPlayerRef.current) {
          ytPlayerRef.current.playVideo();
      } else {
          allStems.forEach(stemKey => {
             if (audioRefs.current[stemKey]) {
                 audioRefs.current[stemKey].play().catch(e => console.error("Play prevented", e));
             }
          });
      }
      
      timeUpdateInterval.current = setInterval(() => {
        if (audioRefs.current['no_vocals']) {
          const current = audioRefs.current['no_vocals'].currentTime;
          setCurrentSongTime(current);
          
          if (audioRefs.current['no_vocals'].duration > 0 && current >= audioRefs.current['no_vocals'].duration - 1) {
              handleNextSong();
          }
        }
      }, 50);
    }
  };

  const handleNextSong = async () => {
    Object.values(audioRefs.current).forEach(audio => {
        if (audio) { audio.pause(); audio.currentTime = 0; }
    });
    clearInterval(timeUpdateInterval.current);
    resetForNewSong();
    
    await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next', id: roomId })
    });
  };

  const handleAlignStart = () => {
    if (parsedLyrics.length > 0) {
      const firstValidLine = parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0];
      setLyricsOffset((currentSongTime - firstValidLine.time).toFixed(2));
    }
  };

  const handleSeek = (newTime) => {
    setCurrentSongTime(newTime);
    Object.values(audioRefs.current).forEach(audio => { if (audio) audio.currentTime = newTime; });
    if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
  };

  // === Party Sync ===
  usePartySync(roomId, 'host', {
    onTogglePlay: togglePlay,
    onNextSong: handleNextSong,
    onAlignStart: handleAlignStart,
    onStartListening: startListening,
    onStopListening: stopListening,
  });

  // === React to current song changes ===
  useEffect(() => {
    if (!partyState) return;
    const song = partyState.currentSong;
    
    if (!song) {
      setIsLoading(false);
      setStems(null);
      setCurrentJobId(null);
      setIsPlaying(false);
      return;
    }
    
    if (song.jobId === currentJobId) return;
    setCurrentJobId(song.jobId);
    setupRoom(song);
  }, [partyState, currentJobId]);

  // === Vocals volume/mute sync ===
  useEffect(() => {
    if (audioRefs.current['vocals']) {
      audioRefs.current['vocals'].muted = !vocalsEnabled;
      audioRefs.current['vocals'].volume = vocalsVolume;
    }
  }, [vocalsEnabled, vocalsVolume]);

  // === Strict Audio Sync ===
  useEffect(() => {
    const leader = audioRefs.current['no_vocals'];
    const follower = audioRefs.current['vocals'];
    if (!leader || !follower) return;

    let isSyncing = false;

    const handleTimeUpdate = () => {
      if (isSyncing) return;
      const diff = leader.currentTime - follower.currentTime;
      const absDiff = Math.abs(diff);
      if (absDiff > 0.5) {
        isSyncing = true;
        follower.currentTime = leader.currentTime;
        follower.playbackRate = 1.0;
        setTimeout(() => { isSyncing = false; }, 50);
      } else if (absDiff > 0.1) {
        follower.playbackRate = diff > 0 ? 1.05 : 0.95;
      } else {
        if (follower.playbackRate !== 1.0) follower.playbackRate = 1.0;
      }
    };

    const handleWaiting = () => { follower.pause(); };
    const handlePlaying = () => { if (isPlaying) follower.play().catch(() => {}); };
    const handlePause = () => { if (leader.paused) follower.pause(); };

    leader.addEventListener('timeupdate', handleTimeUpdate);
    leader.addEventListener('waiting', handleWaiting);
    leader.addEventListener('playing', handlePlaying);
    leader.addEventListener('pause', handlePause);

    return () => {
      leader.removeEventListener('timeupdate', handleTimeUpdate);
      leader.removeEventListener('waiting', handleWaiting);
      leader.removeEventListener('playing', handlePlaying);
      leader.removeEventListener('pause', handlePause);
    };
  }, [stems, isPlaying]);

  // === YouTube state change handler ===
  const handleYouTubeStateChange = (event) => {
    if (event.data === 1) { // PLAYING
      setIsPlaying(true);
      isPlayingRef.current = true;
      const allStems = ['vocals', 'no_vocals'];
      allStems.forEach(stemKey => {
        if (audioRefs.current[stemKey] && audioRefs.current[stemKey].paused) {
          audioRefs.current[stemKey].play().catch(e => console.error("Play prevented", e));
        }
      });
      clearInterval(timeUpdateInterval.current);
      timeUpdateInterval.current = setInterval(() => {
        if (audioRefs.current['no_vocals']) {
          const current = audioRefs.current['no_vocals'].currentTime;
          setCurrentSongTime(current);
          if (audioRefs.current['no_vocals'].duration > 0 && current >= audioRefs.current['no_vocals'].duration - 1) {
            handleNextSong();
          }
        }
      }, 50);
    } else if (event.data === 2) { // PAUSED
      setIsPlaying(false);
      isPlayingRef.current = false;
      clearInterval(timeUpdateInterval.current);
      ['vocals', 'no_vocals'].forEach(stemKey => {
        if (audioRefs.current[stemKey] && !audioRefs.current[stemKey].paused) audioRefs.current[stemKey].pause();
      });
    } else if (event.data === 3) { // BUFFERING
      ['vocals', 'no_vocals'].forEach(stemKey => {
        if (audioRefs.current[stemKey] && !audioRefs.current[stemKey].paused) audioRefs.current[stemKey].pause();
      });
    }
  };

  // === Background Pre-fetcher ===
  useEffect(() => {
    if (!partyState?.queue) return;
    const readySong = partyState.queue.find(q => q.jobStatus?.status === 'ready');
    if (readySong && !prefetchedBlobs.current[readySong.jobId] && !prefetchedBlobs.current[`fetching_${readySong.jobId}`]) {
      prefetchedBlobs.current[`fetching_${readySong.jobId}`] = true;
      console.log(`Prefetching stems for ${readySong.jobId}...`);
      
      const fetchStem = async (stemName) => {
        const res = await fetch(`/api/stems?jobId=${readySong.jobId}&stem=${stemName}`);
        if (!res.ok) throw new Error(`Failed to download ${stemName}`);
        const blob = await res.blob();
        return { url: URL.createObjectURL(blob) };
      };

      Promise.all([fetchStem('vocals'), fetchStem('no_vocals')]).then(([vocalsData, noVocalsData]) => {
        prefetchedBlobs.current[readySong.jobId] = { vocals: vocalsData.url, no_vocals: noVocalsData.url };
        console.log(`Prefetched ${readySong.jobId} successfully!`);
      }).catch(err => {
        console.error("Failed to prefetch song:", err);
        delete prefetchedBlobs.current[`fetching_${readySong.jobId}`];
      });
    }
  }, [partyState?.queue]);

  // === Setup Room (song loading pipeline) ===
  async function setupRoom(song) {
    setupJobIdRef.current = song.jobId;
    Object.values(audioRefs.current).forEach(audio => { if (audio) { audio.pause(); audio.currentTime = 0; } });
    clearInterval(timeUpdateInterval.current);
    
    try {
      setIsLoading(true);
      resetForNewSong();
      
      let backgroundLyrics = null;
      let backgroundSource = null;

      // 1. Wait for AI Background Pipeline
      setLoadingStatus('KaraokeTrain is getting your song ready... 0%');
      await new Promise((resolve, reject) => {
        const checkStatus = async () => {
          if (setupJobIdRef.current !== song.jobId) { clearInterval(pollingInterval); return; }
          try {
            const statusRes = await fetch(`/api/separate/status?jobId=${song.jobId}`);
            const statusData = await statusRes.json();
            if (statusData.status === 'error') { clearInterval(pollingInterval); reject(new Error(statusData.error || 'Separation failed')); }
            else if (statusData.status === 'ready') { clearInterval(pollingInterval); backgroundLyrics = statusData.lyrics; backgroundSource = statusData.lyricsSource; resolve(); }
            else if (statusData.status === 'done') { clearInterval(pollingInterval); resolve(); }
            else { setLoadingStatus(`KaraokeTrain is getting your song ready... ${statusData.progress || 0}%`); }
          } catch (err) {}
        };
        const pollingInterval = setInterval(checkStatus, 2000);
        checkStatus();
      });

      if (setupJobIdRef.current !== song.jobId) return;

      // 2. Fetch Audio Stems
      let vocalsData = null;
      let noVocalsData = null;
      
      if (prefetchedBlobs.current[song.jobId]) {
        vocalsData = { url: prefetchedBlobs.current[song.jobId].vocals };
        noVocalsData = { url: prefetchedBlobs.current[song.jobId].no_vocals };
      } else {
        setLoadingStatus('Downloading high-quality audio stems (this may take a moment)...');
        const fetchStem = async (stemName) => {
          const res = await fetch(`/api/stems?jobId=${song.jobId}&stem=${stemName}`);
          if (!res.ok) throw new Error(`Failed to download ${stemName}`);
          const blob = await res.blob();
          return { url: URL.createObjectURL(blob) };
        };
        [vocalsData, noVocalsData] = await Promise.all([fetchStem('vocals'), fetchStem('no_vocals')]);
      }

      if (setupJobIdRef.current !== song.jobId) return;

      setStems({ vocals: vocalsData.url, no_vocals: noVocalsData.url });

      // 3. Set Lyrics
      if (backgroundLyrics) {
        setParsedLyrics(backgroundLyrics);
        setLyricsSource(backgroundSource === 'lrclib_aligned' ? 'LRCLIB + Whisper AI' : 'Pure Whisper AI (Fallback)');
      } else {
        (async () => {
          try {
            const lyricsRes = await fetch(`/api/room?track=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`);
            const data = await lyricsRes.json();
            let fetchedLyrics = null;
            if (data.lyrics && data.lyrics.syncedLyrics) {
              fetchedLyrics = parseLRC(data.lyrics.syncedLyrics);
            } else if (data.lyrics && data.lyrics.plainLyrics) {
              const lines = data.lyrics.plainLyrics.split('\n').filter(Boolean);
              fetchedLyrics = lines.map((line, i) => ({ time: i * 3, text: line }));
            }
            const plainText = fetchedLyrics ? fetchedLyrics.map(p => p.text).join('\n') : '';
            const aiRes = await fetch('/api/lyrics/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId: song.jobId, plainLyrics: plainText })
            });
            if (setupJobIdRef.current !== song.jobId) return;
            const aiData = await aiRes.json();
            if (aiRes.ok && aiData.lyrics) {
              setParsedLyrics(aiData.lyrics);
              setLyricsSource(aiData.source === 'lrclib_aligned' ? 'LRCLIB + Whisper AI' : 'Pure Whisper AI (Fallback)');
            } else if (fetchedLyrics && fetchedLyrics.some(l => l.time > 0)) {
              setParsedLyrics(fetchedLyrics);
              setLyricsSource('LRCLIB (Original Sync - Whisper Failed)');
            } else {
              setParsedLyrics([]);
              setLyricsSource('No Lyrics Found');
            }
          } catch (e) {
            console.error("Auto Whisper fallback failed:", e);
            setParsedLyrics([]);
            setLyricsSource('Error Loading Lyrics');
          }
        })();
      }

      setLoadingStatus('');
      setIsLoading(false);
      setLyricsOffset(0);
    } catch (err) {
      console.error('Room setup error:', err);
      setLoadingStatus('Error: ' + err.message + ' (Please play the next song in queue)');
    }
  }

  // === Queue handlers ===
  const handleQueueSong = async (track) => {
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', id: roomId, song: { title: track.title, artist: track.artist, art: track.albumArt || '', videoId: track.videoId } })
    });
    setIsSearchOpen(false);
  };

  const handlePlayNow = async (index) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'playNow', id: roomId, index })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

  // Stop mic when no song or loading
  useEffect(() => {
    if (isListening && ((partyState && !partyState.currentSong) || isLoading)) {
      stopListening();
    }
  }, [partyState, isLoading, isListening, stopListening]);

  const song = partyState?.currentSong;

  // === Global Overlay UI ===
  const renderGlobalOverlays = (showSearchWidget = true) => (
    <>
      {!isSearchOpen && (
          <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
            {showSearchWidget && (
                <button 
                  onClick={() => setIsSearchOpen(true)}
                  title="Search Songs"
                  style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: '3rem', height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)' }}
                >
                  <Search size={20} />
                </button>
            )}
            <button 
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              title="Toggle Queue"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: '3rem', height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary-accent)', cursor: 'pointer', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)', position: 'relative' }}
            >
              <Music size={20} />
              {partyState?.queue?.length > 0 && (
                <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--primary-accent)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {partyState.queue.length}
                </div>
              )}
            </button>
          </div>
      )}
      <SongQueue roomId={roomId} onPlayNow={handlePlayNow} />
    </>
  );

  // === EMPTY STATE ===
  if (!partyState || (!partyState.currentSong && !isLoading)) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', padding: '2rem', position: 'relative' }}>
        {renderGlobalOverlays(false)}
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
        {renderGlobalOverlays(false)}
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

      {renderGlobalOverlays(true)}

      {isSearchOpen && (
          <div style={{ height: '30vh', minHeight: '200px', display: 'flex', flexDirection: 'column', padding: '0 2rem', marginBottom: '1rem', zIndex: 10, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
                  <h3 className="heading-2" style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-muted)' }}>Search YouTube</h3>
                  <button onClick={() => setIsSearchOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>✕</span>
                  </button>
              </div>
              <SearchBar onSelect={(song) => { handleQueueSong(song); setIsSearchOpen(false); }} />
          </div>
      )}

      <NowPlayingHeader song={song} onBack={() => router.push('/')} />

      <div style={{ display: 'none' }}>
        {stems && ['vocals', 'no_vocals'].map(stem => (
           stems[stem] && (
             <audio 
               key={stem}
               ref={el => audioRefs.current[stem] = el}
               src={stems[stem]}
               preload="auto"
               crossOrigin="anonymous"
               onLoadedMetadata={(e) => { if (stem === 'no_vocals') setDuration(e.target.duration); }}
             />
           )
        ))}
      </div>

      <PlayerControls onTogglePlay={togglePlay} onNextSong={handleNextSong} onSeek={handleSeek} />

      <div className="main-content-area">
        {song && song.jobId && (
          <VideoPlayer videoId={song.jobId} ytPlayerRef={ytPlayerRef} onStateChange={handleYouTubeStateChange} />
        )}

        <div className="lyrics-container" style={{ marginTop: isVideoVisible ? '0' : '2rem' }}>
          {parsedLyrics.length > 0 && (
            <LyricsDisplay lyrics={parsedLyrics} currentTime={Math.max(0, currentSongTime - (Number(lyricsOffset) || 0))} />
          )}
        </div>
      </div>

      <MicrophonePanel 
        isListening={isListening}
        startListening={startListening}
        stopListening={stopListening}
        setMicVolume={setMicVolume}
        micError={micError}
        pitch={pitch}
      />
    </div>
  );
}
