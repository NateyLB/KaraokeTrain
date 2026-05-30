"use client";

import { useState, useEffect, use, useRef } from 'react';
import { Music2, Clock, CheckCircle2, Trash2, ChevronUp, ChevronDown, Play, Pause, Mic, MicOff, Volume2, VolumeX, SkipForward, Settings, Waves, Sparkles, X, Video } from 'lucide-react';
import SearchBar from '../../../components/SearchBar';

export default function RemotePage({ params }) {
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.id.toUpperCase();
  
  const [partyState, setPartyState] = useState(null);
  const [toast, setToast] = useState('');

  // Settings State
  const [isPlaying, setIsPlaying] = useState(false);
  const [vocalsEnabled, setVocalsEnabled] = useState(true);
  const [vocalsVolume, setVocalsVolume] = useState(1.0);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [micVolume, setMicVolume] = useState(1.0);
  const [echoOn, setEchoOn] = useState(false);
  const [autoTuneOn, setAutoTuneOn] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  
  const lastSyncedSettingsTimestamp = useRef(0);
  const syncTimeoutRef = useRef(null);
  const isSyncingFromServer = useRef(false);
  const lastLocalInteractionTimestamp = useRef(0);

  const syncSettingsToServer = (partialSettings) => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
          fetch('/api/party', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action: 'updateSettings',
                  id: roomId,
                  sender: 'remote',
                  settings: partialSettings
              })
          }).catch(err => console.error("Sync error", err));
      }, 300);
  };

  useEffect(() => {
      if (isSyncingFromServer.current) return;
      lastLocalInteractionTimestamp.current = Date.now();
      syncSettingsToServer({
          isPlaying,
          lyricsOffset,
          vocalsEnabled,
          vocalsVolume,
          micEnabled: isListening,
          micVolume,
          echoOn,
          autoTuneOn,
          isVideoVisible
      });
  }, [isPlaying, lyricsOffset, vocalsEnabled, vocalsVolume, isListening, micVolume, echoOn, autoTuneOn, isVideoVisible]);

  // Poll for party state
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/party?id=${roomId}`);
        if (res.ok) {
          const data = await res.json();
          setPartyState(data);
          
          if (data.settings && data.settings.timestamp > lastSyncedSettingsTimestamp.current) {
              if (data.settings.lastUpdatedBy === 'host') {
                  if (Date.now() - lastLocalInteractionTimestamp.current < 2000) return;
                  
                  isSyncingFromServer.current = true;
                  
                  if (data.settings.lyricsOffset !== undefined) setLyricsOffset(data.settings.lyricsOffset);
                  if (data.settings.vocalsEnabled !== undefined) setVocalsEnabled(data.settings.vocalsEnabled);
                  if (data.settings.micEnabled !== undefined) setIsListening(data.settings.micEnabled);
                  if (data.settings.micVolume !== undefined) setMicVolume(data.settings.micVolume);
                  if (data.settings.echoOn !== undefined) setEchoOn(data.settings.echoOn);
                  if (data.settings.autoTuneOn !== undefined) setAutoTuneOn(data.settings.autoTuneOn);
                  if (data.settings.isVideoVisible !== undefined) setIsVideoVisible(data.settings.isVideoVisible);
                  if (data.settings.isPlaying !== undefined) setIsPlaying(data.settings.isPlaying);
                  
                  setTimeout(() => { isSyncingFromServer.current = false; }, 50);
              }
              lastSyncedSettingsTimestamp.current = data.settings.timestamp;
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [roomId]);

  const handleQueueSong = async (track) => {
    try {
      const res = await fetch('/api/party', {
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
      
      if (res.ok) {
        setToast(`Added "${track.title}" to queue!`);
        setTimeout(() => setToast(''), 3000);
        // Force immediate refresh of state
        const data = await res.json();
        setPartyState(data);

        // Pre-process the song instantly
        fetch(`/api/separate/start?videoId=${track.videoId}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`)
          .catch(err => console.error("Failed to start processing", err));
      }
    } catch (err) {
      console.error(err);
      setToast('Failed to queue song.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleRemoveSong = async (index) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: roomId, index })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

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

  const handleReorderSong = async (oldIndex, newIndex) => {
    if (newIndex < 0 || newIndex >= partyState.queue.length) return;
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', id: roomId, oldIndex, newIndex })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleNextSong = async () => {
    try {
      await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remoteControl', id: roomId, command: 'next' })
      });
    } catch (err) { console.error(err); }
  };

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '100vh', paddingBottom: '100px' }}>
      
      <header style={{ textAlign: 'center', marginTop: '1rem' }}>
        <p className="body-text" style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '0.2rem' }}>Connected to Room</p>
        <h1 className="heading-2 text-gradient" style={{ letterSpacing: '0.2rem' }}>{roomId}</h1>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary-accent)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'slideDown 0.3s ease-out' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{toast}</span>
        </div>
      )}

      {/* Search Area */}
      <div>
         <SearchBar onSelect={handleQueueSong} />
      </div>

      {/* Remote Playback Controls */}
      <div style={{ background: 'rgba(20, 20, 25, 0.8)', backdropFilter: 'blur(10px)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Main Playback Row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
              <button onClick={() => setIsPlaying(!isPlaying)} className="btn-primary" style={{ padding: '0.75rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '3.5rem', height: '3.5rem' }}>
                  {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" style={{ marginLeft: '0.2rem' }} />}
              </button>
              <button onClick={handleNextSong} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <SkipForward size={20} /> Next Song
              </button>
          </div>
          
          <div style={{ height: '1px', background: 'var(--glass-border)', width: '100%' }}></div>

          {/* Mixing Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={16} color="var(--secondary-accent)"/> Mixing Console</h4>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {/* Video Toggle */}
                      <button onClick={() => setIsVideoVisible(!isVideoVisible)} style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', background: isVideoVisible ? 'var(--primary-accent)' : 'var(--glass-bg)', border: 'none', color: 'white' }}>
                          <Video size={16} />
                          {isVideoVisible ? 'Hide Video' : 'Show Video'}
                      </button>
                      
                      {/* Vocals Toggle */}
                      <button onClick={() => setVocalsEnabled(!vocalsEnabled)} style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', background: vocalsEnabled ? 'var(--primary-accent)' : 'var(--glass-bg)', border: 'none', color: 'white' }}>
                          {vocalsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                          {vocalsEnabled ? 'Vocals On' : 'Vocals Off'}
                      </button>
                  </div>
              </div>

              {/* Sliders */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button onClick={() => setIsListening(!isListening)} style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', background: isListening ? 'var(--secondary-accent)' : 'var(--glass-bg)', border: 'none', color: isListening ? '#1a1a1a' : 'var(--text-muted)' }}>
                   {isListening ? <Mic size={16} /> : <MicOff size={16} />}
                   {isListening ? 'Mic On' : 'Mic Off'}
                </button>
                <input type="range" min={0} max={1} step={0.01} value={micVolume} onChange={(e) => setMicVolume(parseFloat(e.target.value))} disabled={!isListening} style={{ flex: 1, accentColor: 'var(--secondary-accent)', cursor: isListening ? 'pointer' : 'not-allowed', opacity: isListening ? 1 : 0.4 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '20px', textAlign: 'center' }}>V</span>
                <input type="range" min={0} max={1} step={0.01} value={vocalsVolume} onChange={(e) => setVocalsVolume(parseFloat(e.target.value))} disabled={!vocalsEnabled} style={{ flex: 1, accentColor: 'var(--secondary-accent)', cursor: vocalsEnabled ? 'pointer' : 'not-allowed', opacity: vocalsEnabled ? 1 : 0.4 }} />
              </div>
              
              {/* Mic Effects */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setEchoOn(!echoOn)} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', background: echoOn ? 'rgba(139, 92, 246, 0.2)' : 'var(--glass-bg)', border: `1px solid ${echoOn ? 'var(--primary-accent)' : 'var(--glass-border)'}`, color: echoOn ? 'var(--primary-accent)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <Waves size={14} /> Echo
                </button>
                <button onClick={() => setAutoTuneOn(!autoTuneOn)} style={{ flex: 1, padding: '0.5rem', borderRadius: '0.5rem', background: autoTuneOn ? 'rgba(236, 72, 153, 0.2)' : 'var(--glass-bg)', border: `1px solid ${autoTuneOn ? 'var(--secondary-accent)' : 'var(--glass-border)'}`, color: autoTuneOn ? 'var(--secondary-accent)' : 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <Sparkles size={14} /> AutoTune
                </button>
              </div>

              {/* Align Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--glass-bg)', padding: '0.5rem 1rem', borderRadius: '99px', border: '1px solid var(--glass-border)', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Lyrics Sync</span>
                      <button onClick={() => {
                          fetch('/api/party', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'remoteControl', id: roomId, command: 'alignStart' })
                          });
                      }} style={{ padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 'bold', background: 'var(--secondary-accent)', color: '#1a1a1a', border: 'none', cursor: 'pointer' }}>
                          Align Start
                      </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) - 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.2rem 0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>-</button>
                      <span style={{ fontSize: '0.9rem', color: 'white', minWidth: '2rem', textAlign: 'center' }}>{(Number(lyricsOffset) || 0).toFixed(1)}s</span>
                      <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) + 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.2rem 0.5rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>+</button>
                  </div>
              </div>
          </div>
      </div>

      <div style={{ flex: 1 }}></div>

      {/* Queue Drawer (Sticky Bottom) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1rem', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '40vh', overflowY: 'auto' }}>
        <h3 className="heading-2" style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} color="var(--secondary-accent)" /> 
          Up Next {partyState?.queue?.length > 0 ? `(${partyState.queue.length})` : ''}
        </h3>
        
        {(!partyState || partyState.queue.length === 0) ? (
          <p className="body-text" style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>The queue is empty. Add a song above!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {partyState.queue.map((song, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <span style={{ opacity: 0.3, fontSize: '0.8rem', fontWeight: 'bold', width: '20px' }}>{i + 1}</span>
                {song.art ? (
                  <img src={song.art} alt={song.title} style={{ width: '40px', height: '30px', borderRadius: '4px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '40px', height: '30px', borderRadius: '4px', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music2 size={14} color="var(--text-muted)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                  <p style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                </div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.2rem 0.4rem', borderRadius: '4px', background: song.jobStatus?.status === 'ready' ? 'rgba(0,255,0,0.1)' : 'var(--glass-bg)', color: song.jobStatus?.status === 'ready' ? '#4ade80' : 'var(--text-muted)', marginRight: '1rem' }}>
                  {song.jobStatus?.status || 'pending'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                   {song.jobStatus?.status === 'ready' && (
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

    </div>
  );
}
