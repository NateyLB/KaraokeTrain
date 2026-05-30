"use client";

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import LyricsDisplay from '../../../components/LyricsDisplay';
import AudioVisualizer from '../../../components/AudioVisualizer';
import SearchBar from '../../../components/SearchBar';
import { parseLRC } from '../../../lib/lyrics';
import { X, Search, ArrowLeft, Mic, MicOff, Music, Gamepad2, Volume2, VolumeX, QrCode, Loader2, Play, Pause, Trash2, ChevronUp, ChevronDown, Waves, Sparkles, AlertCircle, Video } from 'lucide-react';
import { useAudioAnalyzer } from '../../../hooks/useAudioAnalyzer';
import YouTube from 'react-youtube';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function RoomPage({ params }) {
  const unwrappedParams = use(params);
  const router = useRouter();
  const roomId = unwrappedParams.id.toUpperCase();

  const [partyState, setPartyState] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [hostUrl, setHostUrl] = useState('');

  useEffect(() => {
      setHostUrl(window.location.host);
  }, []);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  
  const [parsedLyrics, setParsedLyrics] = useState([]);
  const [guideNotes, setGuideNotes] = useState([]);
  const [currentSongTime, setCurrentSongTime] = useState(0);
  const [stems, setStems] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const audioCtxRef = useRef(null);
  const audioRefs = useRef({ vocals: null, no_vocals: null });
  const setupJobIdRef = useRef(null);
  const prefetchedBlobs = useRef({});

  const [duration, setDuration] = useState(0);
  const [lyricsSource, setLyricsSource] = useState('Loading...');

  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vocalsEnabled, setVocalsEnabled] = useState(true);
  const [vocalsVolume, setVocalsVolume] = useState(1.0);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const timeUpdateInterval = useRef(null);
  const ytPlayerRef = useRef(null);
  const isPlayingRef = useRef(false);
  
  const [echoOn, setEchoOn] = useState(false);
  const [autoTuneOn, setAutoTuneOn] = useState(false);

  const [micPos, setMicPos] = useState({ x: 16, y: 16 }); // Fallback
  useEffect(() => {
      // Calculate top-right position perfectly next to the Search/Queue toggle cluster
      if (typeof window !== 'undefined') {
          // Right padding (16) + Search (48) + Gap (8) + Queue (48) + Gap (8) + Mic Width (48) = 176
          setMicPos({ x: window.innerWidth - 176, y: 16 });
      }
  }, []);
  const [isMicExpanded, setIsMicExpanded] = useState(false);
  const isDraggingMic = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
      isDraggingMic.current = true;
      dragStartPos.current = { x: e.clientX - micPos.x, y: e.clientY - micPos.y };
      e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
      if (!isDraggingMic.current) return;
      setMicPos({
          x: e.clientX - dragStartPos.current.x,
          y: e.clientY - dragStartPos.current.y
      });
  };

  const handlePointerUp = (e) => {
      isDraggingMic.current = false;
      e.target.releasePointerCapture(e.pointerId);
  };

  const { isListening, volume: micVolume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, error: micError } = useAudioAnalyzer();

  // Handle Echo Toggling
  useEffect(() => {
    setEchoEnabled(echoOn);
  }, [echoOn, setEchoEnabled]);

  // Live AutoTune Target Pitch Tracking
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
  
  // 1. Polling the Party State
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/party?id=${roomId}`);
        if (res.ok) {
          const data = await res.json();
          setPartyState(data);
        }
      } catch (err) {}
    };
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [roomId]);

  // 2. React to changes in the current song
  useEffect(() => {
    if (!partyState) return;
    
    const song = partyState.currentSong;
    
    // If no song is playing
    if (!song) {
        setIsLoading(false);
        setStems(null);
        setCurrentJobId(null);
        setIsPlaying(false);
        return;
    }
    
    // If we are already processing or playing this exact job, don't restart!
    if (song.jobId === currentJobId) {
        return;
    }

    setCurrentJobId(song.jobId);
    setupRoom(song);

  }, [partyState, currentJobId]);

  const handleNextSong = async () => {
      Object.values(audioRefs.current).forEach(audio => {
          if (audio) {
              audio.pause();
              audio.currentTime = 0;
          }
      });
      clearInterval(timeUpdateInterval.current);
      setIsPlaying(false);
      setCurrentSongTime(0);
      setDuration(0);
      setStems(null);
      
      await fetch('/api/party', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'next', id: roomId })
      });
  };

  // Background Pre-fetcher
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

          Promise.all([
              fetchStem('vocals'),
              fetchStem('no_vocals')
          ]).then(([vocalsData, noVocalsData]) => {
              prefetchedBlobs.current[readySong.jobId] = {
                  vocals: vocalsData.url,
                  no_vocals: noVocalsData.url,
                  vocalBuffer: vocalsData.buffer
              };
              console.log(`Prefetched ${readySong.jobId} successfully!`);
          }).catch(err => {
              console.error("Failed to prefetch song:", err);
              delete prefetchedBlobs.current[`fetching_${readySong.jobId}`];
          });
      }
  }, [partyState?.queue]);

  async function setupRoom(song) {
      setupJobIdRef.current = song.jobId;
      
      // Pause any existing audio before setting up new song
      Object.values(audioRefs.current).forEach(audio => {
          if (audio) {
              audio.pause();
              audio.currentTime = 0;
          }
      });
      clearInterval(timeUpdateInterval.current);
      
      // Set states safely
      try {
        setIsLoading(true);
        setIsPlaying(false);
        setParsedLyrics([]);
        setGuideNotes([]);
        setStems(null);
        setLyricsSource('Loading...');
        setLyricsOffset(0);
        
        let backgroundLyrics = null;
        let backgroundSource = null;
        let backgroundFetchedLyricsData = null;

        // 1. Wait for AI Background Pipeline (Demucs + Whisper)
        setLoadingStatus('KaraokeTrain is getting your song ready... 0%');
        await new Promise((resolve, reject) => {
          const checkStatus = async () => {
            if (setupJobIdRef.current !== song.jobId) {
                clearInterval(pollingInterval);
                return;
            }
            try {
              const statusRes = await fetch(`/api/separate/status?jobId=${song.jobId}`);
              const statusData = await statusRes.json();

              if (statusData.status === 'error') {
                clearInterval(pollingInterval);
                reject(new Error(statusData.error || 'Separation failed'));
              } else if (statusData.status === 'ready') {
                clearInterval(pollingInterval);
                backgroundLyrics = statusData.lyrics;
                backgroundSource = statusData.lyricsSource;
                backgroundFetchedLyricsData = statusData.fetchedLyricsData;
                resolve();
              } else if (statusData.status === 'done') {
                // Legacy fallback for jobs already running before update
                clearInterval(pollingInterval);
                resolve();
              } else {
                setLoadingStatus(`KaraokeTrain is getting your song ready... ${statusData.progress || 0}%`);
              }
            } catch (err) {}
          };
          
          const pollingInterval = setInterval(checkStatus, 2000);
          checkStatus(); // Run immediately so there's no 2 second delay if it's already done!
        });

        if (setupJobIdRef.current !== song.jobId) return;

        // 2. Fetch Audio Stems
        let vocalsData = null;
        let noVocalsData = null;
        
        if (prefetchedBlobs.current[song.jobId]) {
            // Use background cached versions!
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

            [vocalsData, noVocalsData] = await Promise.all([
                fetchStem('vocals'),
                fetchStem('no_vocals')
            ]);
        }

        if (setupJobIdRef.current !== song.jobId) return;

        const outputStems = {
          vocals: vocalsData.url,
          no_vocals: noVocalsData.url,
        };
        setStems(outputStems);

        // Removed BasicPitch logic to prevent UI freezing

        // 4. Set Lyrics from Background or Run Fallback
        if (backgroundLyrics) {
           // We already have lyrics from the background Whisper process!
           setParsedLyrics(backgroundLyrics);
           setLyricsSource(backgroundSource === 'lrclib_aligned' ? 'LRCLIB + Whisper AI' : 'Pure Whisper AI (Fallback)');
        } else {
           // Fallback logic if the background job didn't do it (e.g. legacy jobs or errors)
           // Run asynchronously so we don't block playback!
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
                  // If Whisper crashed entirely, fallback to the LRCLIB fetched lyrics if they exist!
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
        setLyricsOffset(0); // Reset offset on new song
      } catch (err) {
        console.error('Room setup error:', err);
        setLoadingStatus('Error: ' + err.message + ' (Please play the next song in queue)');
        // Do NOT set isLoading(false) here, otherwise it silently dumps the user into a broken room with no audio!
      }
  }

  const handlePlayNow = async (index) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'playNow', id: roomId, index })
      });
      if (res.ok) {
        const data = await res.json();
        setPartyState(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (audioRefs.current['vocals']) {
      audioRefs.current['vocals'].muted = !vocalsEnabled;
      audioRefs.current['vocals'].volume = vocalsVolume;
    }
  }, [vocalsEnabled, vocalsVolume]);

  const togglePlay = () => {
    if (!stems) return;
    
    if (isPlaying) {
      Object.values(audioRefs.current).forEach(audio => {
          if (audio) audio.pause();
      });
      if (ytPlayerRef.current) ytPlayerRef.current.pauseVideo();
      clearInterval(timeUpdateInterval.current);
      setIsPlaying(false);
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
      isPlayingRef.current = true; // Sync update for the YouTube event listener
      
      // Slave the local audio to the YouTube player's buffering state!
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

  // Strict Audio Synchronization Logic
  useEffect(() => {
    const leader = audioRefs.current['no_vocals'];
    const follower = audioRefs.current['vocals'];
    
    if (!leader || !follower) return;

    let isSyncing = false;

    const handleTimeUpdate = () => {
      if (isSyncing) return;
      const diff = leader.currentTime - follower.currentTime;
      const absDiff = Math.abs(diff);
      
      // Hard seek only if the difference is massive (e.g. user clicked the seekbar)
      if (absDiff > 0.5) {
        isSyncing = true;
        follower.currentTime = leader.currentTime;
        follower.playbackRate = 1.0;
        setTimeout(() => { isSyncing = false; }, 50);
      } else if (absDiff > 0.1) {
        // Soft sync: smoothly speed up or slow down to catch up without stuttering
        follower.playbackRate = diff > 0 ? 1.05 : 0.95;
      } else {
        // Perfectly in sync
        if (follower.playbackRate !== 1.0) {
            follower.playbackRate = 1.0;
        }
      }
    };

    const handleWaiting = () => {
      follower.pause();
    };

    const handlePlaying = () => {
      if (isPlaying) {
        follower.play().catch(() => {});
      }
    };

    const handlePause = () => {
      // If leader paused due to buffering or user, make sure follower pauses
      if (leader.paused) {
         follower.pause();
      }
    };

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

  const handleQueueSong = async (track) => {
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        id: roomId,
        song: {
          title: track.title,
          artist: track.artist,
          art: track.albumArt || '',
          videoId: track.videoId,
        }
      })
    });
    setIsSearchOpen(false);
  };

  const handleRemoveSong = async (index) => {
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id: roomId, index })
    });
  };

  const handleReorderSong = async (oldIndex, newIndex) => {
    if (newIndex < 0 || newIndex >= partyState.queue.length) return;
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', id: roomId, oldIndex, newIndex })
    });
  };

  const song = partyState?.currentSong;

  // Global Overlay UI (Always visible)
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

      {/* Toggleable Bottom Queue Drawer */}
      {isQueueOpen && (
        <div className="animate-fade-in" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1.5rem 2rem', borderTopLeftRadius: '1.25rem', borderTopRightRadius: '1.25rem', maxHeight: '50vh', overflowY: 'auto', zIndex: 60, boxShadow: '0 -0.5rem 2rem rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 className="heading-2" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Music size={18} color="var(--secondary-accent)" /> 
                Up Next {partyState?.queue?.length > 0 ? `(${partyState.queue.length})` : ''}
            </h3>
            <button onClick={() => setIsQueueOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
          </div>
        {(!partyState?.queue || partyState.queue.length === 0) ? (
            <p className="body-text" style={{ opacity: 0.5, fontSize: '0.9rem' }}>Queue is empty.</p>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {partyState.queue.map((qSong, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                        <span style={{ opacity: 0.3, fontSize: '0.9rem', fontWeight: 'bold', width: '1.25rem' }}>{i + 1}</span>
                        {qSong.art ? (
                          <img src={qSong.art} alt={qSong.title} style={{ width: '2.5rem', height: '1.875rem', borderRadius: '0.25rem', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '2.5rem', height: '1.875rem', borderRadius: '0.25rem', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Music size={14} color="var(--text-muted)" />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qSong.title}</p>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qSong.artist}</p>
                        </div>
                        <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', minWidth: '4rem' }}>
                           <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.2rem 0.4rem', borderRadius: '4px', background: qSong.jobStatus?.status === 'ready' ? 'rgba(0,255,0,0.1)' : 'var(--glass-bg)', color: qSong.jobStatus?.status === 'ready' ? '#4ade80' : 'var(--text-muted)' }}>
                             {qSong.jobStatus?.status || 'pending'}
                           </div>
                           {qSong.jobStatus?.status === 'processing' && (
                             <div style={{ width: '100%', height: '4px', background: 'var(--glass-border)', borderRadius: '2px', overflow: 'hidden' }}>
                               <div style={{ width: `${qSong.jobStatus.progress || 0}%`, height: '100%', background: 'var(--primary-accent)', transition: 'width 0.3s ease' }} />
                             </div>
                           )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                           {qSong.jobStatus?.status === 'ready' && (
                             <button onClick={() => handlePlayNow(i)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '0.25rem', marginRight: '0.25rem' }} title="Play Now">
                                 <Play size={18} />
                             </button>
                           )}
                           <button onClick={() => handleReorderSong(i, i - 1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'white', cursor: i === 0 ? 'default' : 'pointer', padding: '0.25rem' }}>
                               <ChevronUp size={20} />
                           </button>
                           <button onClick={() => handleReorderSong(i, i + 1)} disabled={i === partyState.queue.length - 1} style={{ background: 'none', border: 'none', color: i === partyState.queue.length - 1 ? 'rgba(255,255,255,0.1)' : 'white', cursor: i === partyState.queue.length - 1 ? 'default' : 'pointer', padding: '0.25rem' }}>
                               <ChevronDown size={20} />
                           </button>
                           <button onClick={() => handleRemoveSong(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', marginLeft: '0.5rem' }}>
                               <Trash2 size={18} />
                           </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    )}
    </>
  );

  // Stop microphone if queue finishes or while loading the next song
  useEffect(() => {
    if (isListening && ((partyState && !partyState.currentSong) || isLoading)) {
      stopListening();
    }
  }, [partyState, isLoading, isListening, stopListening]);

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
      )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', padding: '2rem', position: 'relative' }}>
        {renderGlobalOverlays(false)}

        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ maxWidth: '40rem', width: '100%', marginBottom: '4rem', textAlign: 'center' }}>
                <h3 className="heading-2" style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Search to add more songs to the queue</h3>
                <SearchBar onSelect={handleQueueSong} />
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                {loadingStatus.startsWith('Error:') ? (
                  <AlertCircle size={64} style={{ color: '#ef4444', marginBottom: '1.5rem' }} />
                ) : (
                  <Loader2 size={64} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--primary-accent)', marginBottom: '1.5rem' }} />
                )}
                <h2 className="heading-2 text-gradient" style={{ marginBottom: '0.5rem' }}>{loadingStatus.startsWith('Error:') ? 'Processing Failed' : 'Loading Next Song...'}</h2>
                <p className="body-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>{loadingStatus}</p>
                {/* spin keyframe is defined in globals.css */}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="karaoke-layout" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', paddingTop: '1rem', position: 'fixed', top: 0, left: 0, paddingBottom: '1rem', boxSizing: 'border-box', overflow: 'hidden' }}>
      <style>{`
        .main-content-area {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
            width: 100%;
        }
        .controls-area {
            display: flex;
            flex-direction: column;
            width: 100%;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .video-container {
            width: 100%;
            max-width: 900px;
            margin: 0 auto 1rem auto;
            padding: 0 2rem;
        }
        .lyrics-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            position: relative;
            width: 100%;
        }

        @media (orientation: landscape) and (min-width: 600px) {
            .karaoke-layout {
                padding-bottom: 6rem !important; /* space for bottom controls */
            }
            .main-content-area {
                flex-direction: row;
                padding: 0 2rem;
                gap: 2rem;
                align-items: stretch;
            }
            .video-container {
                flex: 1;
                max-width: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .lyrics-container {
                flex: 1;
                margin-top: 0 !important;
            }
            .controls-area {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: rgba(10, 10, 15, 0.95);
                backdrop-filter: blur(20px);
                border-top: 1px solid var(--glass-border);
                padding: 1rem 2rem;
                z-index: 40;
                flex-direction: row;
                justify-content: space-between;
                align-items: center;
                gap: 1.5rem;
                margin-bottom: 0;
            }
            .controls-area button {
                padding: 0.5rem 1rem !important;
                font-size: 0.9rem !important;
            }
            .control-buttons-row {
                flex-wrap: nowrap !important;
                gap: 0.5rem !important;
                margin-bottom: 0 !important;
            }
            .seekbar-row {
                flex: 1;
                padding: 0 !important;
                margin: 0 !important;
            }
        }
        .responsive-youtube-iframe {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            border-radius: 0.5rem;
        }
      `}</style>

      {renderGlobalOverlays(true)}

      {/* Top 25% Search Area (Toggleable) */}
      {isSearchOpen && (
          <div style={{ height: '30vh', minHeight: '200px', display: 'flex', flexDirection: 'column', padding: '0 2rem', marginBottom: '1rem', zIndex: 10, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
                  <h3 className="heading-2" style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-muted)' }}>Search YouTube</h3>
                  <button onClick={() => setIsSearchOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
              </div>
              <SearchBar onSelect={(song) => { handleQueueSong(song); setIsSearchOpen(false); }} />
          </div>
      )}

      {/* Bottom 75% Karaoke Room */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0 2rem' }}>
        <button onClick={() => router.push('/')} className="btn-icon">
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div>
            <h2 className="heading-2" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</h2>
            <p className="body-text" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
          </div>
        </div>
      </header>

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

      <div className="controls-area">
          <div className="control-buttons-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'center', alignItems: 'center' }}>
              <button onClick={togglePlay} className="btn-primary" style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '3.2rem', height: '3.2rem' }} title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: '0.2rem' }} />}
              </button>
              <button onClick={() => setVocalsEnabled(!vocalsEnabled)} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: vocalsEnabled ? 1 : 0.7 }}>
                  {vocalsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                  {vocalsEnabled ? 'Vocals On' : 'Vocals Off'}
              </button>
              <button onClick={() => setIsVideoVisible(!isVideoVisible)} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isVideoVisible ? 1 : 0.7 }}>
                  <Video size={20} />
                  {isVideoVisible ? 'Hide Video' : 'Show Video'}
              </button>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => {
                      if (parsedLyrics.length > 0) {
                          const firstValidLine = parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0];
                          setLyricsOffset((currentSongTime - firstValidLine.time).toFixed(2));
                      }
                  }} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600 }} title="Click right when singing starts to align lyrics">
                      Align Start
                  </button>
                  
                  {(() => {
                      const firstValidTime = (parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0])?.time || 0;
                      const displayTime = ((Number(lyricsOffset) || 0) + firstValidTime).toFixed(2);
                      
                      return (
                      <div className="align-start-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--glass-bg)', padding: '0 1rem', borderRadius: '99px', border: '1px solid var(--glass-border)' }}>
                          <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) - 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>-</button>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.9rem', opacity: 0.8, display: 'none' }}>Start: </span>
                              <input 
                                  type="number" 
                                  step="0.1" 
                                  value={displayTime} 
                                  onChange={(e) => {
                                      const newStart = parseFloat(e.target.value);
                                      if (!isNaN(newStart)) setLyricsOffset(newStart - firstValidTime);
                                  }}
                                  onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") setLyricsOffset(0); }}
                                  style={{ width: '3rem', background: 'transparent', border: 'none', color: 'white', fontSize: '0.9rem', textAlign: 'center', outline: 'none' }} 
                              />
                              <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>s</span>
                          </div>
                          <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) + 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>+</button>
                          <button 
                              onClick={() => setLyricsOffset(0)} 
                              style={{ 
                                  color: 'var(--secondary-accent)', 
                                  padding: '0.5rem', 
                                  fontSize: '0.8rem', 
                                  fontWeight: 'bold', 
                                  background: 'transparent', 
                                  border: 'none', 
                                  cursor: 'pointer',
                                  visibility: lyricsOffset !== 0 ? 'visible' : 'hidden'
                              }}
                          >
                              Reset
                          </button>
                      </div>
                      );
                  })()}
              </div>

              <button onClick={handleNextSong} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600 }}>
                  Next Song
              </button>
          </div>

          <div className="seekbar-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 2rem', width: '100%', maxWidth: '900px', margin: '0 auto' }}>
            <span className="body-text" style={{ fontSize: '0.9rem', minWidth: '2.5rem', textAlign: 'right' }}>{formatTime(currentSongTime)}</span>
            <input type="range" min={0} max={duration || 100} value={currentSongTime} onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                setCurrentSongTime(newTime);
                Object.values(audioRefs.current).forEach(audio => { if (audio) audio.currentTime = newTime; });
                if (ytPlayerRef.current) ytPlayerRef.current.seekTo(newTime, true);
            }} style={{ flex: 1, accentColor: 'var(--primary-accent)', cursor: 'pointer' }} />
            <span className="body-text" style={{ fontSize: '0.9rem', minWidth: '2.5rem' }}>{formatTime(duration)}</span>
          </div>
      </div>

      <div className="main-content-area">
        {song && song.jobId && (
          <div className="video-container" style={{ display: isVideoVisible ? 'flex' : 'none' }}>
          <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
            <YouTube 
              videoId={song.jobId} 
              opts={{
                  height: '100%',
                  width: '100%',
                  playerVars: {
                      autoplay: 0,
                      controls: 0,
                      disablekb: 1,
                      fs: 0,
                      modestbranding: 1,
                      rel: 0
                  }
              }}
              iframeClassName="responsive-youtube-iframe"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--glass-border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
            onReady={(event) => {
                ytPlayerRef.current = event.target;
                event.target.mute(); // Mute YouTube so it doesn't clash with Karaoke audio stems
                if (isPlaying) {
                    event.target.playVideo();
                }
            }}
            onStateChange={(event) => {
                // 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING
                if (event.data === 1) {
                    setIsPlaying(true);
                    // YouTube finished buffering and started playing. Start local audio!
                    const allStems = ['vocals', 'no_vocals'];
                    allStems.forEach(stemKey => {
                        if (audioRefs.current[stemKey] && audioRefs.current[stemKey].paused) {
                            audioRefs.current[stemKey].play().catch(e => console.error("Play prevented", e));
                        }
                    });
                } else if (event.data === 2) {
                    setIsPlaying(false);
                    // YouTube is paused. Pause local audio to keep it in sync.
                    const allStems = ['vocals', 'no_vocals'];
                    allStems.forEach(stemKey => {
                        if (audioRefs.current[stemKey] && !audioRefs.current[stemKey].paused) {
                            audioRefs.current[stemKey].pause();
                        }
                    });
                } else if (event.data === 3) {
                    // YouTube is buffering. Pause local audio to keep it in sync.
                    const allStems = ['vocals', 'no_vocals'];
                    allStems.forEach(stemKey => {
                        if (audioRefs.current[stemKey] && !audioRefs.current[stemKey].paused) {
                            audioRefs.current[stemKey].pause();
                        }
                    });
                }
            }}
          />
          </div>
          </div>
        )}

        <div className="lyrics-container" style={{ marginTop: isVideoVisible ? '0' : '2rem' }}>
          {parsedLyrics.length > 0 && (
            <LyricsDisplay lyrics={parsedLyrics} currentTime={Math.max(0, currentSongTime - (Number(lyricsOffset) || 0))} />
          )}
        </div>
      </div>

      {/* Floating Microphone Card */}
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => {
            // Only toggle expansion if we didn't just drag it
            if (!isDraggingMic.current) {
                setIsMicExpanded(!isMicExpanded);
            }
        }}
        style={{
          position: 'fixed',
          top: micPos.y,
          left: micPos.x,
          background: isMicExpanded ? 'rgba(20, 20, 25, 0.95)' : (isListening ? 'rgba(236, 72, 153, 0.9)' : 'rgba(20, 20, 25, 0.8)'),
          backdropFilter: 'blur(20px)',
          border: `1px solid ${isListening ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
          borderRadius: isMicExpanded ? '1rem' : '50%',
          padding: isMicExpanded ? '0.8rem' : '0.6rem',
          display: 'flex',
          flexDirection: 'column',
          gap: isMicExpanded ? '0.6rem' : '0',
          boxShadow: '0 1rem 2rem rgba(0,0,0,0.5)',
          zIndex: 50,
          minWidth: isMicExpanded ? '220px' : 'auto',
          width: 'max-content',
          cursor: isDraggingMic.current ? 'grabbing' : 'grab',
          touchAction: 'none',
          transform: isMicExpanded ? 'translateX(calc(-100% + 47px))' : 'none',
          transition: isDraggingMic.current ? 'none' : 'background 0.2s ease, border-radius 0.2s ease, transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
      }}>
          {!isMicExpanded ? (
              // COLLAPSED VIEW: Just a floating circle
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
                  {isListening ? <Mic size={20} color="white" /> : <MicOff size={20} color="var(--text-muted)" />}
              </div>
          ) : (
              // EXPANDED VIEW: Full Mixing Console
              <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                         <button
                           onClick={(e) => {
                               e.stopPropagation();
                               isListening ? stopListening() : startListening();
                           }}
                           title="Toggle Microphone"
                           style={{
                             background: isListening ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.05)',
                             border: `1px solid ${isListening ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
                             borderRadius: '1rem',
                             padding: '0.25rem 0.6rem',
                             display: 'flex',
                             alignItems: 'center',
                             gap: '0.4rem',
                             cursor: 'pointer',
                             transition: 'all 0.2s ease',
                           }}
                         >
                           {isListening ? <Mic size={14} color="var(--secondary-accent)" /> : <MicOff size={14} color="var(--text-muted)" />}
                           <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isListening ? 'var(--secondary-accent)' : 'var(--text-muted)' }}>{isListening ? 'ON' : 'OFF'}</span>
                         </button>
                         <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600 }}>
                            Settings
                         </h4>
                     </div>
                     <button
                       onClick={(e) => {
                           e.stopPropagation(); 
                           setIsMicExpanded(false);
                       }}
                       title="Close Panel"
                       style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'var(--text-muted)', cursor: 'pointer', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s ease' }}
                     >
                       <X size={16} />
                     </button>
                  </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '32px' }}>Mic</span>
              <input 
                type="range" 
                min={0} 
                max={1} 
                step={0.01}
                defaultValue={0.8}
                onChange={(e) => setMicVolume(parseFloat(e.target.value))}
                disabled={!isListening}
                style={{ flex: 1, accentColor: 'var(--secondary-accent)', height: '4px', cursor: isListening ? 'pointer' : 'not-allowed', opacity: isListening ? 1 : 0.4 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '32px' }}>Voc</span>
              <input 
                type="range" 
                min={0} 
                max={1} 
                step={0.01}
                value={vocalsVolume}
                onChange={(e) => setVocalsVolume(parseFloat(e.target.value))}
                disabled={!vocalsEnabled}
                style={{ flex: 1, accentColor: 'var(--secondary-accent)', height: '4px', cursor: vocalsEnabled ? 'pointer' : 'not-allowed', opacity: vocalsEnabled ? 1 : 0.4 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setEchoOn(!echoOn)}
              disabled={!isListening}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                background: echoOn ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${echoOn ? 'var(--primary-accent)' : 'var(--glass-border)'}`,
                color: echoOn ? 'var(--primary-accent)' : 'var(--text-muted)',
                padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem', cursor: isListening ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                opacity: isListening ? 1 : 0.4
              }}
            >
              <Waves size={14} /> Echo
            </button>
            <button
              onClick={() => setAutoTuneOn(!autoTuneOn)}
              disabled={!isListening}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                background: autoTuneOn ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${autoTuneOn ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
                color: autoTuneOn ? 'var(--secondary-accent)' : 'var(--text-muted)',
                padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem', cursor: isListening ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                opacity: isListening ? 1 : 0.4
              }}
            >
              <Sparkles size={14} /> AutoTune
            </button>
          </div>

          {micError && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
              <AlertCircle size={14} /> {micError}
            </p>
          )}
          </>
        )}
      </div>

    </div>
  );
}
