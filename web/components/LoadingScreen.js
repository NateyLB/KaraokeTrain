'use client';
import { Loader2, AlertCircle } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function LoadingScreen() {
  const { loadingStatus } = useKaraokeStore();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {loadingStatus.startsWith('Error:') ? (
          <AlertCircle size={64} style={{ color: '#ef4444', marginBottom: '1.5rem' }} />
        ) : (
          <Loader2 size={64} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--primary-accent)', marginBottom: '1.5rem' }} />
        )}
        <h2 className="heading-2 text-gradient" style={{ marginBottom: '0.5rem' }}>{loadingStatus.startsWith('Error:') ? 'Processing Failed' : 'Loading Next Song...'}</h2>
        <p className="body-text" style={{ fontSize: '1.1rem', opacity: 0.8 }}>{loadingStatus}</p>
    </div>
  );
}
