'use client';
import { ArrowLeft } from 'lucide-react';

export default function NowPlayingHeader({ song, onBack }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0 2rem' }}>
      <button onClick={onBack} className="btn-icon">
        <ArrowLeft size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <div>
          <h2 className="heading-2" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</h2>
          <p className="body-text" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
        </div>
      </div>
    </header>
  );
}
