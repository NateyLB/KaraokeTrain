'use client';

import { Play, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { useAccess } from '../access/AccessBoundary';
import SongArtwork from '../SongArtwork';
import { usePartyActions } from '../../hooks/usePartyActions';

function QueueStatus({ job }) {
  const ready = job?.status === 'ready';
  const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0));
  return <div style={{ minWidth: '4rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.2rem 0.4rem', borderRadius: 4, background: ready ? 'rgba(0,255,0,0.1)' : 'var(--glass-bg)', color: ready ? '#4ade80' : 'var(--text-muted)' }}>{job?.status || 'pending'}</span>
    {job?.status === 'processing' && <div role="progressbar" aria-label="Song processing" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ height: 4, background: 'var(--glass-border)', borderRadius: 2 }}>
      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary-accent)' }} />
    </div>}
  </div>;
}

function QueueButton({ label, disabled, onClick, color = 'white', children }) {
  return <button title={label} aria-label={label} disabled={disabled} onClick={onClick} style={{ background: 'none', border: 'none', padding: 4, color: disabled ? 'rgba(255,255,255,0.15)' : color, cursor: disabled ? 'default' : 'pointer' }}>{children}</button>;
}

export default function QueueList({ roomId, partyState, emptyMessage = 'Queue is empty.' }) {
  const access = useAccess();
  const { removeSong, playNow, reorderSong, nextSong } = usePartyActions(roomId);
  const current = partyState?.currentSong;
  const waiting = current && ['pending', 'processing', 'error'].includes(current.jobStatus?.status) ? current : null;
  const queue = partyState?.queue || [];
  const rows = waiting ? [waiting, ...queue] : queue;
  if (!rows.length) return <p className="body-text" style={{ opacity: 0.5, fontSize: '0.9rem' }}>{emptyMessage}</p>;

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    {rows.map((song, position) => {
      const index = waiting ? position - 1 : position;
      const isCurrent = index < 0;
      return <div key={song.queueId || `${song.jobId}:${song.addedAt}:${position}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: 8 }}>
        <span style={{ opacity: 0.3, width: 20, fontSize: '0.8rem' }}>{position + 1}</span>
        <SongArtwork src={song.art} title="" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
        </div>
        <QueueStatus job={song.jobStatus} />
        {access.role !== 'guest' && <div style={{ display: 'flex', alignItems: 'center' }}>
          {song.jobStatus?.status === 'ready' && !isCurrent && <QueueButton label={`Play ${song.title} now`} color="#4ade80" onClick={() => playNow(index, song)}><Play size={18} /></QueueButton>}
          <QueueButton label={`Move ${song.title} up`} disabled={isCurrent || index === 0} onClick={() => reorderSong(index, index - 1, song, queue[index - 1])}><ChevronUp size={18} /></QueueButton>
          <QueueButton label={`Move ${song.title} down`} disabled={isCurrent || index === queue.length - 1} onClick={() => reorderSong(index, index + 1, song, queue[index + 1])}><ChevronDown size={18} /></QueueButton>
          <QueueButton label={`Remove ${song.title}`} color="#ef4444" onClick={() => isCurrent ? nextSong(song) : removeSong(index, song)}><Trash2 size={18} /></QueueButton>
        </div>}
      </div>;
    })}
  </div>;
}
