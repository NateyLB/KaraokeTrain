'use client';
import { ArrowLeft } from 'lucide-react';

export default function NowPlayingHeader({ song, onBack }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0 2rem' }}>
      <button onClick={onBack} className="btn-icon">
        <ArrowLeft size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 className="heading-2" title={song.title} style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, lineHeight: 1.2, width: '100%' }}>{song.title}</h2>
          <p className="body-text" title={song.artist} style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0, opacity: 0.8, width: '100%' }}>{song.artist}</p>
        </div>
      </div>
    </header>
  );
}
