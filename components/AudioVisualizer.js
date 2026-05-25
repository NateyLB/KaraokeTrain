"use client";

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Waves, Sparkles } from 'lucide-react';
import { useAudioAnalyzer } from '../hooks/useAudioAnalyzer';
import { useGrading } from '../hooks/useGrading';

// Vocal range we visualize: C2 (MIDI 36) to C6 (MIDI 84)
const MIN_MIDI = 40;
const MAX_MIDI = 80;
const MIDI_RANGE = MAX_MIDI - MIN_MIDI;
const TRAIL_SECONDS = 3;     // how many seconds of pitch history to show
const CANVAS_FPS = 60;

function midiToY(midi, height) {
  const clamped = Math.max(MIN_MIDI, Math.min(MAX_MIDI, midi));
  return height - ((clamped - MIN_MIDI) / MIDI_RANGE) * height;
}

export default function AudioVisualizer({ lyrics, currentSongTime, guideNotes }) {
  const { isListening, volume, pitch, startListening, stopListening, setMicVolume, setEchoEnabled, setVocoderTargetFrequency, error } =
    useAudioAnalyzer();
  const { score, combo, feedback, pitchQuality, resetScore } = useGrading(
    lyrics,
    currentSongTime,
    volume,
    pitch,
    guideNotes
  );

  const canvasRef = useRef(null);
  const pitchTrailRef = useRef([]); // [{ midi, timestamp }]
  const smoothedPitchRef = useRef(null);
  const animFrameRef = useRef(null);

  const [echoOn, setEchoOn] = useState(false);
  const [autoTuneOn, setAutoTuneOn] = useState(false);

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

  // Handle Echo Toggling
  useEffect(() => {
    setEchoEnabled(echoOn);
  }, [echoOn, setEchoEnabled]);

  // Draw the SingStar-style pitch canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Record current pitch to trail
      if (pitch && pitch.midi && isListening) {
        pitchTrailRef.current.push({ midi: pitch.midi, ts: now });
      }
      // Trim trail to last TRAIL_SECONDS
      const cutoff = now - TRAIL_SECONDS * 1000;
      pitchTrailRef.current = pitchTrailRef.current.filter(p => p.ts > cutoff);

      // --- Clear ---
      ctx.clearRect(0, 0, W, H);

      // --- Background ---
      ctx.fillStyle = 'rgba(10, 5, 20, 0.95)';
      ctx.fillRect(0, 0, W, H);

      // --- Horizontal note guide lines ---
      const noteColors = {
        C: 'rgba(255,255,255,0.06)',
        'C#': 'rgba(255,255,255,0.03)',
        D: 'rgba(255,255,255,0.06)',
        'D#': 'rgba(255,255,255,0.03)',
        E: 'rgba(255,255,255,0.06)',
        F: 'rgba(255,255,255,0.06)',
        'F#': 'rgba(255,255,255,0.03)',
        G: 'rgba(255,255,255,0.06)',
        'G#': 'rgba(255,255,255,0.03)',
        A: 'rgba(255,255,255,0.06)',
        'A#': 'rgba(255,255,255,0.03)',
        B: 'rgba(255,255,255,0.06)',
      };
      const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

      for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
        const noteName = noteNames[midi % 12];
        const y = midiToY(midi, H);
        ctx.strokeStyle = noteColors[noteName];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();

        // Label C notes
        if (noteName === 'C') {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.font = '9px monospace';
          ctx.fillText(`C${Math.floor(midi / 12) - 1}`, 4, y - 2);
        }
      }

      // --- Current time line (vertical) ---
      const timelineX = W * 0.65;
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(timelineX, 0);
      ctx.lineTo(timelineX, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // --- Guide Notes (Continuous Pitch Line) ---
      if (guideNotes) {
        const FUTURE_SECONDS = 6; // See 6 seconds into the future
        
        // Find notes that are currently on screen
        const visibleNotes = guideNotes.filter(n => {
          const startOffset = n.startTime - currentSongTime;
          const endOffset = n.endTime - currentSongTime;
          
          // Old notes move left at TRAIL_SECONDS scale, future notes move right at FUTURE_SECONDS scale
          const startX = startOffset < 0 
            ? timelineX + (startOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (startOffset / FUTURE_SECONDS) * (W - timelineX);
            
          const endX = endOffset < 0
            ? timelineX + (endOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (endOffset / FUTURE_SECONDS) * (W - timelineX);
            
          return endX > 0 && startX < W;
        });

        // 1. Draw connecting lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < visibleNotes.length - 1; i++) {
          const curr = visibleNotes[i];
          const next = visibleNotes[i + 1];
          
          const currEndOffset = curr.endTime - currentSongTime;
          const nextStartOffset = next.startTime - currentSongTime;
          
          const currEndX = currEndOffset < 0 
            ? timelineX + (currEndOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (currEndOffset / FUTURE_SECONDS) * (W - timelineX);
            
          const nextStartX = nextStartOffset < 0
            ? timelineX + (nextStartOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (nextStartOffset / FUTURE_SECONDS) * (W - timelineX);
            
          const currY = midiToY(curr.midi, H);
          const nextY = midiToY(next.midi, H);
          
          if (next.startTime - curr.endTime < 2.0) { // Only connect if gap is < 2s
            ctx.moveTo(currEndX, currY);
            ctx.bezierCurveTo(currEndX + (nextStartX - currEndX)/2, currY, currEndX + (nextStartX - currEndX)/2, nextY, nextStartX, nextY);
          }
        }
        ctx.stroke();

        // 2. Draw note blocks
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; // Made slightly brighter
        for (const note of visibleNotes) {
          const startOffset = note.startTime - currentSongTime;
          const endOffset = note.endTime - currentSongTime;
          
          const startX = startOffset < 0 
            ? timelineX + (startOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (startOffset / FUTURE_SECONDS) * (W - timelineX);
            
          const endX = endOffset < 0
            ? timelineX + (endOffset / TRAIL_SECONDS) * timelineX
            : timelineX + (endOffset / FUTURE_SECONDS) * (W - timelineX);
            
          const y = midiToY(note.midi, H);
          const height = 12;
          
          // Prevent rendering errors if endX < startX due to timescale change boundary
          if (endX > startX) {
            ctx.beginPath();
            ctx.roundRect(startX, y - height/2, endX - startX, height, 6);
            ctx.fill();
          }
        }
      }

      // --- Pitch Trail ---
      if (pitchTrailRef.current.length > 1) {
        const trail = pitchTrailRef.current;

        for (let i = 1; i < trail.length; i++) {
          const prev = trail[i - 1];
          const curr = trail[i];

          // X position: map timestamp to canvas X (older = further left from timelineX)
          const prevAge = (now - prev.ts) / (TRAIL_SECONDS * 1000);
          const currAge = (now - curr.ts) / (TRAIL_SECONDS * 1000);
          const prevX = timelineX - prevAge * timelineX;
          const currX = timelineX - currAge * timelineX;

          const prevY = midiToY(prev.midi, H);
          const currY = midiToY(curr.midi, H);

          // Color: older = more transparent, newer = vibrant purple-pink
          const alpha = Math.pow(1 - currAge, 1.5);
          const r = Math.round(139 + (236 - 139) * (1 - currAge));
          const g = Math.round(92 + (72 - 92) * (1 - currAge));
          const b = Math.round(246 + (153 - 246) * (1 - currAge));

          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.85})`;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(currX, currY);
          ctx.stroke();
        }
      }

      // --- Current Pitch Ball (at timelineX) ---
      if (pitch && pitch.midi && isListening) {
        // Smooth Pitch Glide (LERP)
        const targetMidi = pitch.midi;
        if (smoothedPitchRef.current === null) {
          smoothedPitchRef.current = targetMidi;
        } else {
          smoothedPitchRef.current += (targetMidi - smoothedPitchRef.current) * 0.25; // 25% glide per frame
        }

        const ballY = midiToY(smoothedPitchRef.current, H);
        const ballX = timelineX;

        // Glow
        const glow = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, 22);
        glow.addColorStop(0, 'rgba(236, 72, 153, 0.8)');
        glow.addColorStop(0.4, 'rgba(139, 92, 246, 0.4)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ballX, ballY, 22, 0, Math.PI * 2);
        ctx.fill();

        // Core ball
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Note label next to ball
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(pitch.name, ballX + 12, ballY + 4);

        // Cents offset indicator (sharp/flat)
        if (Math.abs(pitch.cents) > 8) {
          const centsText = pitch.cents > 0 ? `+${pitch.cents}¢` : `${pitch.cents}¢`;
          ctx.fillStyle = Math.abs(pitch.cents) > 20 ? '#ef4444' : '#facc15';
          ctx.font = '10px monospace';
          ctx.fillText(centsText, ballX + 12, ballY + 16);
        }
      } else if (isListening) {
        smoothedPitchRef.current = null; // reset glide
        
        // Idle dot when listening but not singing
        const idleY = H / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(timelineX, idleY, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- On-Screen Current Word ---
      if (lyrics && lyrics.length > 0) {
        // Find active line
        let activeLine = null;
        for (let i = 0; i < lyrics.length; i++) {
          if (currentSongTime >= lyrics[i].time) {
            activeLine = lyrics[i];
          }
        }
        
        if (activeLine && activeLine.words) {
          const activeWordObj = activeLine.words.find(w => 
            currentSongTime >= w.start && currentSongTime <= w.end
          );
          
          if (activeWordObj) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = 'bold 36px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
            ctx.shadowBlur = 15;
            ctx.fillText(activeWordObj.word, timelineX, H * 0.15);
            ctx.shadowBlur = 0; // reset
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isListening, pitch]);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    resizeObserver.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Score Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
        <div style={{ textAlign: 'left' }}>
          <p className="body-text" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Score</p>
          <p className="text-gradient" style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1 }}>{score.toLocaleString()}</p>
        </div>

        {/* Feedback text */}
        <div style={{ textAlign: 'center', minWidth: '80px' }}>
          {feedback && (
            <p className="animate-fade-in text-gradient" style={{
              fontWeight: 800,
              fontSize: '1.1rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>
              {feedback}
            </p>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <p className="body-text" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Combo</p>
          <p className="text-gradient" style={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1 }}>×{combo}</p>
        </div>
      </div>

      {/* SingStar Canvas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '120px',
        borderRadius: 'var(--border-radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--glass-border)',
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />

        {/* Mic button overlay */}
        <button
          onClick={isListening ? stopListening : startListening}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isListening ? 'rgba(236, 72, 153, 0.3)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${isListening ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isListening
            ? <Mic size={16} color="var(--secondary-accent)" />
            : <MicOff size={16} color="var(--text-muted)" />
          }
        </button>

        {/* Not listening placeholder */}
        {!isListening && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '0.4rem', pointerEvents: 'none',
          }}>
            <Mic size={24} color="var(--text-muted)" style={{ opacity: 0.4 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', opacity: 0.6 }}>Tap mic to start singing</p>
          </div>
        )}
      </div>

      {/* Pitch quality bar */}
      {isListening && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pitch</p>
          <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pitchQuality}%`,
              background: pitchQuality > 70
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : pitchQuality > 40
                  ? 'linear-gradient(90deg, var(--primary-accent), #facc15)'
                  : 'linear-gradient(90deg, #ef4444, #f97316)',
              transition: 'width 0.15s ease, background 0.3s ease',
              borderRadius: '99px',
              boxShadow: pitchQuality > 70 ? '0 0 6px #22c55e' : 'none',
            }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', width: '30px', textAlign: 'right' }}>{Math.round(pitchQuality)}%</p>
        </div>
      )}

      {/* Controls Row */}
      {isListening && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Mic Volume Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '150px' }}>
            <Mic size={14} color="var(--text-muted)" />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monitor</p>
            <input 
              type="range" 
              min={0} 
              max={5} 
              step={0.1}
              defaultValue={0.8}
              onChange={(e) => setMicVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--secondary-accent)', height: '4px', cursor: 'pointer' }}
            />
          </div>

          {/* Effect Toggles */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setEchoOn(!echoOn)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                background: echoOn ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${echoOn ? 'var(--primary-accent)' : 'var(--glass-border)'}`,
                color: echoOn ? 'var(--primary-accent)' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Waves size={12} /> Echo
            </button>
            <button
              onClick={() => setAutoTuneOn(!autoTuneOn)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                background: autoTuneOn ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${autoTuneOn ? 'var(--secondary-accent)' : 'var(--glass-border)'}`,
                color: autoTuneOn ? 'var(--secondary-accent)' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <Sparkles size={12} /> Robot Vocoder
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle size={14} /> {error}
        </p>
      )}
    </div>
  );
}
