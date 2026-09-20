'use client';
import { Music, X, Play, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import useKaraokeStore from '../store/useKaraokeStore';

export default function SongQueue({ roomId }) {
  const { partyState, setPartyState, isQueueOpen, setIsQueueOpen } = useKaraokeStore();

  const handlePlayNow = async (index) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'playNow', id: roomId, index })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleRemoveSong = async (index) => {
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id: roomId, index })
    });
  };

  const handleReorderSong = async (oldIndex, newIndex) => {
    if (newIndex < 0 || newIndex >= partyState.queue.length) return;
    await fetch('/api/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', id: roomId, oldIndex, newIndex })
    });
  };

  if (!isQueueOpen) return null;

  const currentProcessingSong = partyState?.currentSong && ['pending', 'processing', 'error'].includes(partyState.currentSong.jobStatus?.status) 
    ? partyState.currentSong 
    : null;
    
  const displayQueue = currentProcessingSong 
    ? [currentProcessingSong, ...(partyState?.queue || [])] 
    : (partyState?.queue || []);

  return (
    <div className="animate-fade-in" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1.5rem 2rem', borderTopLeftRadius: '1.25rem', borderTopRightRadius: '1.25rem', maxHeight: '50vh', overflowY: 'auto', zIndex: 60, boxShadow: '0 -0.5rem 2rem rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 className="heading-2" style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Music size={18} color="var(--secondary-accent)" /> 
            Up Next {displayQueue.length > 0 ? `(${displayQueue.length})` : ''}
        </h3>
        <button onClick={() => setIsQueueOpen(false)} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'white', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
      </div>
      {displayQueue.length === 0 ? (
          <p className="body-text" style={{ opacity: 0.5, fontSize: '0.9rem' }}>Queue is empty.</p>
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {displayQueue.map((qSong, i) => {
                  const isProcessingSong = currentProcessingSong && i === 0;
                  const originalIndex = isProcessingSong ? -1 : (currentProcessingSong ? i - 1 : i);
                  
                  return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem' }}>
                      <span style={{ opacity: 0.3, fontSize: '0.9rem', fontWeight: 'bold', width: '1.25rem' }}>{i + 1}</span>
                      {qSong.art ? (
                        <img src={qSong.art} alt={qSong.title} style={{ width: '2.5rem', height: '1.875rem', borderRadius: '0.25rem', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '2.5rem', height: '1.875rem', borderRadius: '0.25rem', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Music size={14} color="var(--text-muted)" />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qSong.title}</p>
                          <p style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{qSong.artist}</p>
                      </div>
                      <div style={{ marginRight: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', minWidth: '4rem' }}>
                         <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.2rem 0.4rem', borderRadius: '4px', background: qSong.jobStatus?.status === 'ready' ? 'rgba(0,255,0,0.1)' : 'var(--glass-bg)', color: qSong.jobStatus?.status === 'ready' ? '#4ade80' : 'var(--text-muted)' }}>
                           {qSong.jobStatus?.status || 'pending'}
                         </div>
                         {qSong.jobStatus?.status === 'processing' && (
                           <div style={{ width: '100%', height: '4px', background: 'var(--glass-border)', borderRadius: '2px', overflow: 'hidden' }}>
                             <div style={{ width: `${qSong.jobStatus.progress || 0}%`, height: '100%', background: 'var(--primary-accent)', transition: 'width 0.3s ease' }} />
                           </div>
                         )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                         {qSong.jobStatus?.status === 'ready' && !isProcessingSong && (
                           <button onClick={() => handlePlayNow(originalIndex)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '0.25rem', marginRight: '0.25rem' }} title="Play Now">
                               <Play size={18} />
                           </button>
                         )}
                         <button onClick={() => handleReorderSong(originalIndex, originalIndex - 1)} disabled={isProcessingSong || originalIndex === 0} style={{ background: 'none', border: 'none', color: (isProcessingSong || originalIndex === 0) ? 'rgba(255,255,255,0.1)' : 'white', cursor: (isProcessingSong || originalIndex === 0) ? 'default' : 'pointer', padding: '0.25rem' }}>
                             <ChevronUp size={20} />
                         </button>
                         <button onClick={() => handleReorderSong(originalIndex, originalIndex + 1)} disabled={isProcessingSong || originalIndex === partyState.queue.length - 1} style={{ background: 'none', border: 'none', color: (isProcessingSong || originalIndex === partyState.queue.length - 1) ? 'rgba(255,255,255,0.1)' : 'white', cursor: (isProcessingSong || originalIndex === partyState.queue.length - 1) ? 'default' : 'pointer', padding: '0.25rem' }}>
                             <ChevronDown size={20} />
                         </button>
                         <button onClick={() => {
                             if (isProcessingSong) {
                                 // Call 'next' to remove current processing song
                                 fetch('/api/party', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'next', id: roomId }) });
                             } else {
                                 handleRemoveSong(originalIndex);
                             }
                         }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', marginLeft: '0.5rem' }}>
                             <Trash2 size={18} />
                         </button>
                      </div>
                  </div>
                  );
              })}
          </div>
      )}
    </div>
  );
}
