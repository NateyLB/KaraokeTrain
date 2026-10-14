import { ChevronRight } from 'lucide-react';
import SongArtwork from './SongArtwork';
import { decodeEntities } from '../lib/text';

export default function SongSearchResult({ track, onSelect, compact = false }) {
  return <button type="button" className="glass-panel animate-fade-in" onClick={() => onSelect(track)} style={{
    display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', color: 'inherit',
    padding: compact ? '0.75rem' : '0.875rem', gap: '1rem', cursor: 'pointer',
    ...(compact ? { borderLeft: '3px solid var(--primary-accent)' } : {}),
  }}>
    <SongArtwork src={track.albumArt} title="" width={compact ? 56 : 64} height={compact ? 42 : 48} />
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: compact ? '0.9rem' : '0.95rem', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{decodeEntities(track.title)}</span>
      <span className="body-text" style={{ display: 'block', fontSize: '0.75rem', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decodeEntities(track.artist)}</span>
    </span>
    <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
  </button>;
}
