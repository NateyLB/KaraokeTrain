import { useEffect, useRef, useState } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { useRecording } from '../hooks/useRecording';
import { Video, VideoOff, Circle, Square } from 'lucide-react';

export default function RecordingPanel() {
  const { isRecordingExpanded } = useKaraokeStore();
  const { 
    isRecording, 
    isRecordingVideo, 
    videoStream, 
    setVideoEnabled, 
    startRecording, 
    stopRecording 
  } = useRecording();

  const videoRef = useRef(null);
  const [duration, setDuration] = useState(0);

  // Sync video stream to the preview video element
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  // Timer
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: '4.5rem',
        right: '1rem',
        background: 'rgba(20, 20, 25, 0.95)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${isRecording ? '#ef4444' : 'var(--glass-border)'}`,
        borderRadius: '1rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 1rem 3rem rgba(0,0,0,0.5)',
        zIndex: 49,
        minWidth: '240px',
        width: 'max-content',
        opacity: isRecordingExpanded ? 1 : 0,
        transform: isRecordingExpanded ? 'translateY(0)' : 'translateY(-10px)',
        pointerEvents: isRecordingExpanded ? 'auto' : 'none',
        transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h3 className="heading-3" style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Circle size={16} fill={isRecording ? '#ef4444' : 'none'} color={isRecording ? '#ef4444' : 'white'} /> 
          Recording
        </h3>
        {isRecording && (
          <span style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
            {formatTime(duration)}
          </span>
        )}
      </div>

      <button
        onClick={() => setVideoEnabled(!isRecordingVideo)}
        disabled={isRecording}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center',
          background: isRecordingVideo ? 'rgba(59, 130, 246, 0.2)' : 'var(--glass-bg)',
          border: `1px solid ${isRecordingVideo ? '#3b82f6' : 'var(--glass-border)'}`,
          color: isRecordingVideo ? '#3b82f6' : 'white',
          padding: '0.75rem', borderRadius: '0.5rem',
          cursor: isRecording ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          opacity: isRecording ? 0.5 : 1
        }}
      >
        {isRecordingVideo ? <Video size={18} /> : <VideoOff size={18} color="var(--text-muted)" />}
        {isRecordingVideo ? 'Webcam Enabled' : 'Enable Webcam'}
      </button>

      {/* Video Preview */}
      <div style={{
        display: isRecordingVideo ? 'block' : 'none',
        width: '100%',
        height: '140px',
        background: 'black',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
        />
        {!videoStream && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Loading camera...
          </div>
        )}
      </div>

      {isRecording ? (
        <button
          onClick={stopRecording}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
            background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444',
            padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Square size={16} fill="#ef4444" /> Stop & Save
        </button>
      ) : (
        <button
          onClick={startRecording}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
            background: 'rgba(239, 68, 68, 0.9)', border: 'none', color: 'white',
            padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Circle size={16} fill="white" /> Start Recording
        </button>
      )}
      
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0, marginTop: '0.25rem' }}>
        Audio includes your microphone, effects, and the instrumental track.
      </p>
    </div>
  );
}
