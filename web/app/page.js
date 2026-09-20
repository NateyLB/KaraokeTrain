"use client";

import { useState } from 'react';
import { Music2, Tv, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import OverlayButtons from '../components/OverlayButtons';

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');

  const hostParty = () => {
    // Generate random 4 character alphanumeric code safely
    const code = Math.random().toString(36).substring(2, 10).padStart(4, '0').substring(0, 4).toUpperCase();
    
    // Unlock Web Audio API synchronously inside this user gesture!
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!window.__karaokeAudioCtx) {
        window.__karaokeAudioCtx = new AudioContext({ latencyHint: 'interactive' });
      }
      if (window.__karaokeAudioCtx.state === 'suspended') {
        window.__karaokeAudioCtx.resume().catch(() => {});
      }
    } catch(e) {}

    router.push(`/room/${code}`);
  };

  const joinParty = (e) => {
    e.preventDefault();
    if (joinCode.trim().length >= 4) {
      router.push(`/remote/${joinCode.toUpperCase()}`);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4rem', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', position: 'relative' }}>
      
      {/* Home Context Info Toggle (Hides Mic/Search/Queue) */}
      <OverlayButtons roomId="" showSearchButton={false} context="home" />

      <header style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <Music2 size={56} color="var(--primary-accent)" />
          <h1 className="heading-1 text-gradient" style={{ fontSize: '3rem' }}>KaraokeTrain</h1>
        </div>
        <p className="body-text" style={{ fontSize: '1.2rem', opacity: 0.8 }}>The ultimate AI-powered karaoke engine.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', maxWidth: '400px' }}>
        
        {/* Host Button */}
        <button 
          onClick={hostParty}
          className="glass-panel hover-glow" 
          style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', border: '2px solid var(--primary-accent)' }}
        >
          <Tv size={48} color="var(--primary-accent)" />
          <div>
            <h2 className="heading-2">Host a Party</h2>
            <p className="body-text" style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem' }}>Start a new room on this display.</p>
          </div>
        </button>

        <div style={{ textAlign: 'center', opacity: 0.5, fontWeight: 'bold' }}>OR</div>

        {/* Join Form */}
        <form onSubmit={joinParty} className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <Smartphone size={32} color="var(--secondary-accent)" />
            <h2 className="heading-2">Join a Party</h2>
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Enter room code..." 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={12}
              style={{ textAlign: 'center', letterSpacing: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem' }}
            />
            <button 
              type="submit" 
              className="btn-primary"
              disabled={joinCode.length < 4}
            >
              Join
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
