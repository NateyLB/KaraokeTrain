'use client';
import { useState, useRef } from 'react';
import { Mic, MicOff, X, Waves, Sparkles, AlertCircle } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function MicrophonePanel({ isListening, startListening, stopListening, setMicVolume, micError }) {
  const { vocalsEnabled, vocalsVolume, setVocalsVolume, echoOn, setEchoOn, autoTuneOn, setAutoTuneOn, isMicExpanded, setIsMicExpanded } = useKaraokeStore();

  const [micPos, setMicPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth - 176 : 16, y: 16 });
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

  return (
    <div 
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => {
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px' }}>
                {isListening ? <Mic size={20} color="white" /> : <MicOff size={20} color="var(--text-muted)" />}
            </div>
        ) : (
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
  );
}
