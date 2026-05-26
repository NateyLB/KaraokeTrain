"use client";

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import LyricsDisplay from '../../../components/LyricsDisplay';
import AudioVisualizer from '../../../components/AudioVisualizer';
import SearchBar from '../../../components/SearchBar';
import { parseLRC } from '../../../lib/lyrics';
import { BasicPitch, outputToNotesPoly, noteFramesToTime } from '@spotify/basic-pitch';
import { ArrowLeft, Loader2, Music, Mic, MicOff, Search, X, QrCode, Trash2, ChevronUp, ChevronDown, Waves, Sparkles, Gamepad2, AlertCircle } from 'lucide-react';
import { useAudioAnalyzer } from '../../../hooks/useAudioAnalyzer';

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
  const audioCtxRef = useRef(null);
  const audioRefs = useRef({ vocals: null, no_vocals: null });

  const [duration, setDuration] = useState(0);
  const [lyricsSource, setLyricsSource] = useState('Loading...');

  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [vocalsEnabled, setVocalsEnabled] = useState(false);
  const [vocalsVolume, setVocalsVolume] = useState(1.0);
  const timeUpdateInterval = useRef(null);
  
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [echoOn, setEchoOn] = useState(false);
  const [autoTuneOn, setAutoTuneOn] = useState(false);

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
        // If it's playing, check if it finished
        if (duration > 0 && currentSongTime >= duration - 1) {
            handleNextSong();
        }
        return;
    }

    setCurrentJobId(song.jobId);
    setupRoom(song);

  }, [partyState, currentJobId, duration, currentSongTime]);

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

  async function setupRoom(song) {
      // Set states safely
      setIsPlaying(true);
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
          
          checkStatus(); // Run immediately so there's no 2 second delay if it's already done!
          var pollingInterval = setInterval(checkStatus, 2000);
        });

        // 2. Setup Stems
        const outputStems = {
          vocals: `/api/stems?jobId=${song.jobId}&stem=vocals`,
          no_vocals: `/api/stems?jobId=${song.jobId}&stem=no_vocals`,
        };
        setStems(outputStems);

        // 3. Extract True Pitch (Runs entirely in background so playback isn't blocked!)
        (async () => {
            try {
                const basicPitch = new BasicPitch('https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json');
                
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22050 });
                const vocalRes = await fetch(outputStems.vocals);
                const vocalArrayBuffer = await vocalRes.arrayBuffer();
                const vocalAudioBuffer = await audioCtx.decodeAudioData(vocalArrayBuffer);
                
                let monoAudioBuffer = vocalAudioBuffer;
                if (vocalAudioBuffer.numberOfChannels > 1) {
                    monoAudioBuffer = audioCtx.createBuffer(1, vocalAudioBuffer.length, vocalAudioBuffer.sampleRate);
                    const monoData = monoAudioBuffer.getChannelData(0);
                    const leftData = vocalAudioBuffer.getChannelData(0);
                    const rightData = vocalAudioBuffer.getChannelData(1);
                    for (let i = 0; i < vocalAudioBuffer.length; i++) {
                        monoData[i] = (leftData[i] + rightData[i]) / 2;
                    }
                }
                
                // Don't await this! Let it run in the background.
                basicPitch.evaluateModel(
                  monoAudioBuffer,
                  (framesData, onsets, contours) => {
                     const noteEvents = outputToNotesPoly(framesData, onsets, 0.25, 0.25, 5);
                     const noteTimes = noteFramesToTime(noteEvents);
                     
                     const notes = noteTimes.map(n => ({
                        midi: Math.round(n.pitchMidi),
                        startTime: n.startTimeSeconds,
                        endTime: n.startTimeSeconds + n.durationSeconds,
                        amplitude: n.amplitude
                     })).filter(n => n.amplitude > 0.2);
                     
                     if (notes.length > 0) setGuideNotes(notes);
                  },
                  (pitchPercentages) => { }
                ).catch(err => console.error("BasicPitch error:", err));
            } catch (e) {
                console.error("Failed to start BasicPitch extraction", e);
            }
        })();

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
        setLoadingStatus('Error: ' + err.message);
        setIsLoading(false);
      }
  }

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
           audioRefs.current[stemKey].play();
        }
      });
      
      timeUpdateInterval.current = setInterval(() => {
        if (audioRefs.current['no_vocals']) {
          setCurrentSongTime(audioRefs.current['no_vocals'].currentTime);
        }
      }, 50);
      
      setIsPlaying(true);
    }
  };

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
      {showSearchWidget && !isSearchOpen && (
          <button 
            onClick={() => setIsSearchOpen(true)}
            style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: '3rem', height: '3rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', boxShadow: '0 0.25rem 0.75rem rgba(0,0,0,0.3)' }}
          >
            <Search size={24} />
          </button>
      )}

      {/* Full-width Sticky Bottom Queue Drawer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1.5rem 2rem', borderTopLeftRadius: '1.25rem', borderTopRightRadius: '1.25rem', maxHeight: '35vh', overflowY: 'auto', zIndex: 40, boxShadow: '0 -0.5rem 2rem rgba(0,0,0,0.4)' }}>
        <h3 className="heading-2" style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Music size={18} color="var(--secondary-accent)" /> 
            Up Next {partyState?.queue?.length > 0 ? `(${partyState.queue.length})` : ''}
        </h3>
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
                             {qSong.jobStatus?.status === 'processing' ? `${Math.round(qSong.jobStatus.progress || 0)}%` : (qSong.jobStatus?.status || 'pending')}
                           </div>
                           {qSong.jobStatus?.status === 'processing' && (
                             <div style={{ width: '100%', height: '4px', background: 'var(--glass-border)', borderRadius: '2px', overflow: 'hidden' }}>
                               <div style={{ width: `${qSong.jobStatus.progress || 0}%`, height: '100%', background: 'var(--primary-accent)', transition: 'width 0.3s ease' }} />
                             </div>
                           )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
    </>
  );

  // Stop microphone if queue finishes and there is no active song
  useEffect(() => {
    if (partyState && !partyState.currentSong && isListening) {
      stopListening();
    }
  }, [partyState, isListening, stopListening]);

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
                <Loader2 size={64} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--primary-accent)', marginBottom: '1.5rem' }} />
                <h2 className="heading-2 text-gradient" style={{ marginBottom: '0.5rem' }}>Loading Next Song...</h2>
                <p className="body-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>{loadingStatus}</p>
                {/* spin keyframe is defined in globals.css */}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', paddingTop: '1rem', position: 'relative', paddingBottom: partyState?.queue?.length > 0 ? '35vh' : '1rem' }}>
      
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
          <div style={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', padding: '0.2rem 0.5rem', borderRadius: '4px', border: lyricsSource.includes('Fallback') ? '1px solid #ef4444' : '1px solid var(--primary-accent)', color: lyricsSource.includes('Fallback') ? '#ef4444' : 'var(--primary-accent)', background: lyricsSource.includes('Fallback') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(139, 92, 246, 0.1)' }}>
            {lyricsSource}
          </div>
        </div>
        {song.art && (
          <img src={song.art} alt="Thumbnail" style={{ width: '3rem', height: '2.25rem', borderRadius: 'var(--border-radius-sm)', objectFit: 'cover' }} />
        )}
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

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
         <button onClick={togglePlay} className="btn-primary" style={{ padding: '0.75rem 2rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Music size={20} />
            {isPlaying ? 'Pause' : 'Start Singing'}
         </button>
         <button onClick={() => setVocalsEnabled(!vocalsEnabled)} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: vocalsEnabled ? 1 : 0.7 }}>
            {vocalsEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            {vocalsEnabled ? 'Vocals On' : 'Vocals Off'}
         </button>
         <button onClick={() => {
             const nextState = !gameModeEnabled;
             setGameModeEnabled(nextState);
             if (nextState && !isListening) {
                 startListening();
             }
         }} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: gameModeEnabled ? 1 : 0.7 }}>
            <Gamepad2 size={20} />
            {gameModeEnabled ? 'Game On' : 'Game Off'}
         </button>
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
             
             return lyricsOffset !== 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--glass-bg)', padding: '0 1rem', borderRadius: '99px', border: '1px solid var(--glass-border)' }}>
                  <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) - 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>-</button>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Start Time: </span>
                     <input 
                         type="number" 
                         step="0.1" 
                         value={displayTime} 
                         onChange={(e) => {
                             const newStart = parseFloat(e.target.value);
                             if (!isNaN(newStart)) {
                                 setLyricsOffset(newStart - firstValidTime);
                             }
                         }}
                         onBlur={(e) => {
                             if (e.target.value === "" || e.target.value === "-") {
                                 setLyricsOffset(0);
                             }
                         }}
                         style={{ 
                             width: '3.5rem', 
                             background: 'transparent', 
                             border: 'none', 
                             color: 'white', 
                             fontSize: '0.9rem', 
                             textAlign: 'center',
                             outline: 'none',
                             fontFamily: 'inherit'
                         }} 
                     />
                     <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>s</span>
                  </div>
                  <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) + 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>+</button>
                  <button onClick={() => setLyricsOffset(0)} style={{ color: 'var(--secondary-accent)', padding: '0.5rem', marginLeft: '0.25rem', fontSize: '0.8rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>Reset</button>
              </div>
             );
         })()}
         <button onClick={handleNextSong} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600 }}>
            Next Song
         </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 2rem', marginBottom: '1rem' }}>
        <span className="body-text" style={{ fontSize: '0.9rem', minWidth: '2.5rem', textAlign: 'right' }}>{formatTime(currentSongTime)}</span>
        <input type="range" min={0} max={duration || 100} value={currentSongTime} onChange={(e) => {
            const newTime = parseFloat(e.target.value);
            setCurrentSongTime(newTime);
            Object.values(audioRefs.current).forEach(audio => { if (audio) audio.currentTime = newTime; });
        }} style={{ flex: 1, accentColor: 'var(--primary-accent)', cursor: 'pointer' }} />
        <span className="body-text" style={{ fontSize: '0.9rem', minWidth: '2.5rem' }}>{formatTime(duration)}</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', marginTop: '2rem' }}>
        {parsedLyrics.length > 0 && (
          <LyricsDisplay lyrics={parsedLyrics} currentTime={Math.max(0, currentSongTime - (Number(lyricsOffset) || 0))} />
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingBottom: '1rem', display: gameModeEnabled ? 'block' : 'none' }}>
        <AudioVisualizer lyrics={parsedLyrics} currentSongTime={currentSongTime} guideNotes={guideNotes} isListening={isListening} pitch={pitch} volume={micVolume} />
      </div>

      {/* Floating Microphone Card */}
      <div style={{
          position: 'fixed',
          top: '5rem',
          left: '1rem',
          background: 'rgba(20, 20, 25, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '1rem',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 1rem 2rem rgba(0,0,0,0.5)',
          zIndex: 50,
          minWidth: '280px'
      }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <h4 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mic size={18} color="var(--primary-accent)" /> Microphone
             </h4>
             <button
               onClick={() => {
                   if (gameModeEnabled) return;
                   isListening ? stopListening() : startListening();
               }}
               title={gameModeEnabled ? "Microphone must be on while Game is active" : "Toggle Microphone"}
               style={{
                 width: '40px',
                 height: '40px',
                 borderRadius: '50%',
                 background: isListening ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.05)',
                 border: `1px solid ${isListening ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 cursor: gameModeEnabled ? 'not-allowed' : 'pointer',
                 opacity: gameModeEnabled ? 0.5 : 1,
                 transition: 'all 0.2s ease',
               }}
             >
               {isListening
                 ? <Mic size={20} color="var(--secondary-accent)" />
                 : <MicOff size={20} color="var(--text-muted)" />
               }
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
      </div>

    </div>
  );
}
