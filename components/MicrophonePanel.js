'use client';
import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X, Waves, Sparkles, AlertCircle } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';

/**
 * Fully self-contained microphone panel.
 * Owns useAudioAnalyzer internally — no mic props needed from parent.
 * Manages: echo sync, autotune pitch targeting, mic↔store bridge, auto-stop.
 */
export default function MicrophonePanel() {
  const {
    vocalsEnabled, vocalsVolume, setVocalsVolume,
    echoOn, setEchoOn, autoTuneOn, setAutoTuneOn,
    echoCancellationOn, setEchoCancellationOn,
    isMicExpanded, setIsMicExpanded,
    currentSongTime, guideNotes, partyState, isLoading,
    micVolume, setMicVolume
  } = useKaraokeStore();

  // === Own the mic hook ===
  const {
    isListening, pitch,
    startListening, stopListening, setMicVolume: applyMicGain,
    setEchoEnabled, setVocoderTargetFrequency, setEchoCancellation,
    error: micError,
  } = useAudioAnalyzer();

  // === Bridge mic volume → AudioAnalyzer gain ===
  useEffect(() => {
    applyMicGain(micVolume);
  }, [micVolume, applyMicGain]);

  // === Bridge mic state → Zustand store (outbound: local mic change → store) ===
  useEffect(() => {
    useKaraokeStore.getState().setMicEnabled(isListening);
  }, [isListening]);

  // === Bridge store → mic state (inbound: remote toggle → actual mic) ===
  const storeMicEnabled = useKaraokeStore(s => s.micEnabled);
  useEffect(() => {
    if (storeMicEnabled && !isListening) {
      startListening(echoCancellationOn);
    } else if (!storeMicEnabled && isListening) {
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMicEnabled]);

  // === Dynamic Echo Cancellation update ===
  useEffect(() => {
    setEchoCancellation(echoCancellationOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoCancellationOn]);

  // === Echo sync ===
  useEffect(() => {
    setEchoEnabled(echoOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoOn]);

  // === AutoTune target pitch ===
  useEffect(() => {
    if (!autoTuneOn || !isListening) {
      setVocoderTargetFrequency(0);
      return;
    }
    if (guideNotes) {
      const activeGuideNote = guideNotes.find(
        (n) => currentSongTime >= n.startTime && currentSongTime <= n.endTime
      );
      if (activeGuideNote) {
        const freq = 440 * Math.pow(2, (activeGuideNote.midi - 69) / 12);
        setVocoderTargetFrequency(freq);
      } else {
        setVocoderTargetFrequency(0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTuneOn, isListening, guideNotes, currentSongTime]);

  // === Stop mic when no song or loading ===
  useEffect(() => {
    if (isListening && ((partyState && !partyState.currentSong) || isLoading)) {
      stopListening();
    }
  }, [partyState, isLoading, isListening, stopListening]);

  // === Panel visibility is controlled entirely by isMicExpanded ===

  return (
    <div 
      style={{
        position: 'fixed',
        top: '4.5rem',
        right: '1rem',
        background: 'rgba(20, 20, 25, 0.95)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${isListening ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
        borderRadius: '1rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: '0 1rem 3rem rgba(0,0,0,0.5)',
        zIndex: 49,
        minWidth: '240px',
        width: 'max-content',
        opacity: isMicExpanded ? 1 : 0,
        transform: isMicExpanded ? 'translateY(0)' : 'translateY(-10px)',
        pointerEvents: isMicExpanded ? 'auto' : 'none',
        transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
    }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                       <button
                         onClick={(e) => {
                             e.stopPropagation();
                             isListening ? stopListening() : startListening(echoCancellationOn);
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
              value={micVolume}
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
          <button
            onClick={() => setEchoCancellationOn(!echoCancellationOn)}
            disabled={!isListening}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              background: echoCancellationOn ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${echoCancellationOn ? '#3b82f6' : 'var(--glass-border)'}`,
              color: echoCancellationOn ? '#3b82f6' : 'var(--text-muted)',
              padding: '0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem', cursor: isListening ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
              opacity: isListening ? 1 : 0.4
            }}
          >
            <AlertCircle size={14} /> Noise Cancel
          </button>
        </div>

        {isListening && !echoCancellationOn && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', marginTop: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
            <AlertCircle size={12} /> Headphones required to prevent feedback
          </p>
        )}

        {micError && (
          <p style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
            <AlertCircle size={14} /> {micError}
          </p>
        )}
    </div>
  );
}
