'use client';

import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import useKaraokeStore from '../../store/useKaraokeStore';
import QueueList from './QueueList';

export default function RemoteQueueDrawer({ roomId }) {
  const [open, setOpen] = useState(false);
  const party = useKaraokeStore(state => state.partyState);
  return <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1rem', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: open ? '50vh' : 65, overflowY: open ? 'auto' : 'hidden', transition: 'max-height 0.3s ease-in-out', zIndex: 50 }}>
    <button onClick={() => setOpen(value => !value)} aria-expanded={open} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: 'none', border: 0, color: 'var(--text-main)', cursor: 'pointer' }}>
      <span style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={16} color="var(--secondary-accent)" /> Up Next {party?.queue?.length ? `(${party.queue.length})` : ''}</span>
      {open ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
    </button>
    {open && <QueueList roomId={roomId} partyState={party} emptyMessage="The queue is empty. Add a song above!" />}
  </div>;
}
