'use client';
import { Play, Pause, SkipForward, Mic, MicOff, Volume2, VolumeX, Video, Waves, Sparkles, Settings } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function RemoteControls({ roomId }) {
  const { 
    isPlaying, setIsPlaying, vocalsEnabled, setVocalsEnabled, vocalsVolume, setVocalsVolume,
    lyricsOffset, setLyricsOffset, micEnabled, setMicEnabled, micVolume, setMicVolume,
    echoOn, setEchoOn, autoTuneOn, setAutoTuneOn, isVideoVisible, setIsVideoVisible
  } = useKaraokeStore();

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
              <button onClick={() => setMicEnabled(!micEnabled)} style={{ padding: '0.4rem 0.8rem', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', background: micEnabled ? 'var(--secondary-accent)' : 'var(--glass-bg)', border: 'none', color: micEnabled ? '#1a1a1a' : 'var(--text-muted)' }}>
               {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
               {micEnabled ? 'Mic On' : 'Mic Off'}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={micVolume} onChange={(e) => setMicVolume(parseFloat(e.target.value))} disabled={!micEnabled} style={{ flex: 1, accentColor: 'var(--secondary-accent)', cursor: micEnabled ? 'pointer' : 'not-allowed', opacity: micEnabled ? 1 : 0.4 }} />
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
  );
}
