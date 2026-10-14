'use client';

import SearchBar from '../SearchBar';

export default function RoomSearchPanel({ onClose, onQueueSong }) {
  return (
        <div style={{ height: '80vh', maxHeight: '80vh', minHeight: '300px', display: 'flex', flexDirection: 'column', padding: '0 2rem', marginBottom: '1rem', zIndex: 10, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', width: '100%' }}>
            <h3 className="heading-2" style={{ fontSize: '1.2rem', margin: 0, color: 'var(--text-muted)' }}>Search YouTube</h3>
            <button onClick={onClose} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1rem', lineHeight: 1 }}>✕</span>
            </button>
          </div>
          <SearchBar onSelect={onQueueSong} />
        </div>
  );
}
