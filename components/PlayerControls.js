'use client';
import { Play, Pause, Volume2, VolumeX, Video, SkipBack, SkipForward } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function PlayerControls({ onTogglePlay, onNextSong, onPreviousSong, onSeek }) {
  const { 
    isPlaying, vocalsEnabled, setVocalsEnabled, isVideoVisible, setIsVideoVisible,
    lyricsOffset, setLyricsOffset, currentSongTime, duration, parsedLyrics 
  } = useKaraokeStore();

  return (
    <div className="controls-area">
        <div className="control-buttons-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            
            {/* Left: Play buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button onClick={onPreviousSong} className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.8rem', height: '2.8rem' }} title="Previous Song">
                    <SkipBack size={18} fill="currentColor" />
                </button>
                <button onClick={onTogglePlay} className="btn-primary" style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.8rem', height: '2.8rem', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.3)' }} title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '0.2rem' }} />}
                </button>
                <button onClick={onNextSong} className="btn-secondary" style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.8rem', height: '2.8rem' }} title="Next Song">
                    <SkipForward size={18} fill="currentColor" />
                </button>
            </div>

            {/* Right: Toggles + Slider */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '280px' }}>
                
                {/* Toggles */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                    <button onClick={() => setVocalsEnabled(!vocalsEnabled)} className="btn-secondary mobile-icon-btn" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: vocalsEnabled ? 1 : 0.7 }}>
                        {vocalsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        <span className="hide-on-mobile">{vocalsEnabled ? 'Vocals On' : 'Vocals Off'}</span>
                    </button>
                    <button onClick={() => setIsVideoVisible(!isVideoVisible)} className="btn-secondary mobile-icon-btn" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isVideoVisible ? 1 : 0.7 }}>
                        <Video size={20} />
                        <span className="hide-on-mobile">{isVideoVisible ? 'Hide Video' : 'Show Video'}</span>
                    </button>
                    
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={() => {
                            if (parsedLyrics.length > 0) {
                                const firstValidLine = parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0];
                                setLyricsOffset((currentSongTime - firstValidLine.time).toFixed(2));
                            }
                        }} className="btn-secondary mobile-icon-btn" style={{ padding: '0.5rem 1rem', borderRadius: '99px', fontSize: '1rem', fontWeight: 600 }} title="Click right when singing starts to align lyrics">
                            <span className="hide-on-mobile">Align Start</span>
                            <span style={{ display: 'none' }} className="show-on-mobile-inline">Align</span>
                        </button>
                        
                        {(() => {
                            const firstValidTime = (parsedLyrics.find(l => l.text.trim().length > 0) || parsedLyrics[0])?.time || 0;
                            const displayTime = ((Number(lyricsOffset) || 0) + firstValidTime).toFixed(2);
                            
                            return (
                            <div className="align-start-group" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--glass-bg)', padding: '0 0.5rem', borderRadius: '99px', border: '1px solid var(--glass-border)' }}>
                                <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) - 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.4rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>-</button>
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
                                        style={{ width: '2.5rem', background: 'transparent', border: 'none', color: 'white', fontSize: '0.9rem', textAlign: 'center', outline: 'none', padding: 0 }} 
                                    />
                                    <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>s</span>
                                </div>
                                <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) + 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.4rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>+</button>
                                <button 
                                    onClick={() => setLyricsOffset(0)} 
                                    style={{ 
                                        color: 'var(--secondary-accent)', 
                                        padding: '0.4rem', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 'bold', 
                                        background: 'transparent', 
                                        border: 'none', 
                                        cursor: 'pointer',
                                        visibility: 'visible'
                                    }}
                                >
                                    Reset
                                </button>
                            </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Slider */}
                <div className="seekbar-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', padding: '0 1rem' }}>
                    <span className="body-text" style={{ fontSize: '0.8rem', minWidth: '2.5rem', textAlign: 'right' }}>{formatTime(currentSongTime)}</span>
                    <input type="range" min={0} max={duration || 100} value={currentSongTime} onChange={(e) => {
                        const newTime = parseFloat(e.target.value);
                        onSeek(newTime);
                    }} style={{ flex: 1, accentColor: 'var(--primary-accent)', cursor: 'pointer' }} />
                    <span className="body-text" style={{ fontSize: '0.8rem', minWidth: '2.5rem' }}>{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    </div>
  );
}
