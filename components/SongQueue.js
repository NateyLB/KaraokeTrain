'use client';
import { Music, X } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';
import QueueList from './queue/QueueList';

export default function SongQueue({ roomId }) {
  const partyState = useKaraokeStore(state => state.partyState);
  const isQueueOpen = useKaraokeStore(state => state.isQueueOpen);
  const setIsQueueOpen = useKaraokeStore(state => state.setIsQueueOpen);
  if (!isQueueOpen) return null;

  const count = (partyState?.queue?.length || 0) + (partyState?.currentSong && ['pending', 'processing', 'error'].includes(partyState.currentSong.jobStatus?.status) ? 1 : 0);

  return (
    <div className="animate-fade-in" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1.5rem 2rem', borderTopLeftRadius: '1.25rem', borderTopRightRadius: '1.25rem', maxHeight: '50vh', overflowY: 'auto', zIndex: 60, boxShadow: '0 -0.5rem 2rem rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="heading-2" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Music size={18} color="var(--secondary-accent)" /> 
            Up Next {count > 0 ? `(${count})` : ''}
        </h3>
        <button aria-label="Close queue" onClick={() => setIsQueueOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
      </div>
      <QueueList roomId={roomId} partyState={partyState} />
    </div>
  );
}
