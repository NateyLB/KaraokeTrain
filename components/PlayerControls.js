'use client';
import { Play, Pause, Volume2, VolumeX, Video, SkipBack, SkipForward, Languages } from 'lucide-react';
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
    lyricsOffset, setLyricsOffset, currentSongTime, duration, parsedLyrics, firstValidTime,
    selectedVersionIdx, setSelectedVersionIdx
  } = useKaraokeStore();

  const isMultiVersion = parsedLyrics && parsedLyrics.length > 1 && parsedLyrics[0].lyrics;

  const cycleLanguage = () => {
    if (!isMultiVersion) return;
    const nextIdx = (selectedVersionIdx + 1) % parsedLyrics.length;
    setSelectedVersionIdx(nextIdx);
  };

  return (
    <div className="controls-area">
        <div className="control-buttons-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
            
            {/* Left: Play buttons */}
            <div className="pc-left" style={{ display: 'flex', gap: 'clamp(0.2rem, 1vw, 0.5rem)', alignItems: 'center' }}>
                <button onClick={onPreviousSong} className="btn-secondary" style={{ padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(2rem, 5vw, 2.5rem)', height: 'clamp(2rem, 5vw, 2.5rem)' }} title="Previous Song">
                    <SkipBack size={16} fill="currentColor" />
                </button>
                <button onClick={onTogglePlay} className="btn-primary" style={{ padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(2.2rem, 6vw, 2.8rem)', height: 'clamp(2.2rem, 6vw, 2.8rem)', boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.3)' }} title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: '0.2rem' }} />}
                </button>
                <button onClick={onNextSong} className="btn-secondary" style={{ padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(2rem, 5vw, 2.5rem)', height: 'clamp(2rem, 5vw, 2.5rem)' }} title="Next Song">
                    <SkipForward size={16} fill="currentColor" />
                </button>
            </div>

            {/* Right: Toggles + Slider */}
            <div className="pc-right mobile-contents" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '280px' }}>
                
                {/* Toggles */}
                <div className="pc-toggles mobile-contents" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                    
                    <div className="mobile-nowrap-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {isMultiVersion && (
                            <button 
                                onClick={cycleLanguage} 
                                className="btn-secondary mobile-icon-btn" 
                                style={{ padding: 'clamp(0.4rem, 1vw, 0.5rem) clamp(0.75rem, 2vw, 1rem)', borderRadius: '99px', fontSize: 'clamp(0.7rem, 2vw, 0.9rem)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'relative', whiteSpace: 'nowrap' }}
                                title={`Switch Language (Current: ${parsedLyrics[selectedVersionIdx]?.label})`}
                            >
                                <Languages size={16} />
                                <span className="hide-on-mobile" style={{ marginLeft: '0.2rem' }}>
                                    {parsedLyrics[selectedVersionIdx]?.label?.includes('Romanized') ? 'ENG' : 'A/文'}
                                </span>
                            </button>
                        )}
                        <button onClick={() => setVocalsEnabled(!vocalsEnabled)} className="btn-secondary mobile-icon-btn" style={{ padding: 'clamp(0.4rem, 1vw, 0.5rem) clamp(0.75rem, 2vw, 1rem)', borderRadius: '99px', fontSize: 'clamp(0.7rem, 2vw, 0.9rem)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: vocalsEnabled ? 1 : 0.7, whiteSpace: 'nowrap' }}>
                            {vocalsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            <span className="hide-on-mobile">{vocalsEnabled ? 'Vocals On' : 'Vocals Off'}</span>
                        </button>
                        <button onClick={() => setIsVideoVisible(!isVideoVisible)} className="btn-secondary mobile-icon-btn" style={{ padding: 'clamp(0.4rem, 1vw, 0.5rem) clamp(0.75rem, 2vw, 1rem)', borderRadius: '99px', fontSize: 'clamp(0.7rem, 2vw, 0.9rem)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: isVideoVisible ? 1 : 0.7, whiteSpace: 'nowrap' }}>
                            <Video size={16} />
                            <span className="hide-on-mobile">{isVideoVisible ? 'Hide Video' : 'Show Video'}</span>
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button onClick={() => {
                            if (parsedLyrics.length > 0) {
                                setLyricsOffset((currentSongTime - firstValidTime).toFixed(2));
                            }
                        }} className="btn-secondary mobile-icon-btn" style={{ padding: '0.5rem 1rem', borderRadius: '99px', fontSize: '1rem', fontWeight: 600 }} title="Click right when singing starts to align lyrics">
                            <span className="hide-on-mobile">Align Start</span>
                            <span style={{ display: 'none' }} className="show-on-mobile-inline">Align</span>
                        </button>
                        
                        {(() => {
                            const displayTime = ((Number(lyricsOffset) || 0) + firstValidTime).toFixed(2);
                            
                            return (
                            <div className="align-start-group" style={{ display: 'flex', alignItems: 'center', gap: '0', background: 'var(--glass-bg)', padding: '0 0.2rem', borderRadius: '99px', border: '1px solid var(--glass-border)' }}>
                                <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) - 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.2rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>-</button>
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
                                        style={{ width: '2rem', background: 'transparent', border: 'none', color: 'white', fontSize: '0.85rem', textAlign: 'center', outline: 'none', padding: 0 }} 
                                    />
                                    <span style={{ fontSize: '0.85rem', opacity: 0.8, marginLeft: '-0.1rem' }}>s</span>
                                </div>
                                <button onClick={() => setLyricsOffset(o => Math.round(((Number(o) || 0) + 0.5) * 100) / 100)} style={{ color: 'white', padding: '0.2rem', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}>+</button>
                                <button 
                                    onClick={() => setLyricsOffset(0)} 
                                    style={{ 
                                        color: 'var(--secondary-accent)', 
                                        padding: '0.2rem 0.2rem', 
                                        fontSize: '0.7rem', 
                                        fontWeight: 'bold', 
                                        background: 'transparent', 
                                        border: 'none', 
                                        cursor: 'pointer',
                                        visibility: 'visible',
                                        marginLeft: '0.1rem'
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
