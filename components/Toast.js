'use client';

import { useEffect } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function Toast() {
  const message = useKaraokeStore(state => state.toast);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      if (useKaraokeStore.getState().toast === message) useKaraokeStore.getState().setToast('');
    }, 4000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!message) return null;
  return <div role="status" aria-live="polite" style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', maxWidth: '90vw', background: 'var(--primary-accent)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 50, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '0.9rem' }}>{message}</div>;
}
