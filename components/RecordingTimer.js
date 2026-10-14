import { useEffect, useState } from 'react';

/** Mounted for each recording, so a new session naturally starts at zero. */
export default function RecordingTimer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>;
}
