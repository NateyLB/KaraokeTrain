"use client";

import { use } from 'react';
import { Music2, Clock, CheckCircle2, Trash2, ChevronUp, ChevronDown, Play } from 'lucide-react';
import SearchBar from '../../../components/SearchBar';
import RemoteControls from '../../../components/RemoteControls';
import useKaraokeStore from '../../../store/useKaraokeStore';
import { usePartySync } from '../../../hooks/usePartySync';

export default function RemotePage({ params }) {
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.id.toUpperCase();

  const { partyState, setPartyState, toast, setToast } = useKaraokeStore();

  // Sync with server
  usePartySync(roomId, 'remote');

  const handleQueueSong = async (track) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          id: roomId,
          song: {
            title: track.title,
            artist: track.artist,
            art: track.albumArt || '',
            videoId: track.videoId,
          }
        })
      });
      
      if (res.ok) {
        setToast(`Added "${track.title}" to queue!`);
        setTimeout(() => setToast(''), 3000);
        const data = await res.json();
        setPartyState(data);

        // Pre-process the song instantly
        fetch(`/api/separate/start?videoId=${track.videoId}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`, { method: 'POST' })
          .catch(err => console.error("Failed to start processing", err));
      }
    } catch (err) {
      console.error(err);
      setToast('Failed to queue song.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleRemoveSong = async (index) => {
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: roomId, index })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

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

  const handleReorderSong = async (oldIndex, newIndex) => {
    if (!partyState || newIndex < 0 || newIndex >= partyState.queue.length) return;
    try {
      const res = await fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder', id: roomId, oldIndex, newIndex })
      });
      if (res.ok) setPartyState(await res.json());
    } catch (err) { console.error(err); }
  };

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '100vh', paddingBottom: '100px' }}>
      
      <header style={{ textAlign: 'center', marginTop: '1rem' }}>
        <p className="body-text" style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '0.2rem' }}>Connected to Room</p>
        <h1 className="heading-2 text-gradient" style={{ letterSpacing: '0.2rem' }}>{roomId}</h1>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary-accent)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'slideDown 0.3s ease-out' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{toast}</span>
        </div>
      )}

      {/* Search Area */}
      <div>
         <SearchBar onSelect={handleQueueSong} />
      </div>

      {/* Remote Playback Controls */}
      <RemoteControls roomId={roomId} />

      <div style={{ flex: 1 }}></div>

      {/* Queue Drawer (Sticky Bottom) */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--glass-border)', padding: '1rem', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '40vh', overflowY: 'auto' }}>
        <h3 className="heading-2" style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} color="var(--secondary-accent)" /> 
          Up Next {partyState?.queue?.length > 0 ? `(${partyState.queue.length})` : ''}
        </h3>
        
        {(!partyState || partyState.queue.length === 0) ? (
          <p className="body-text" style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0' }}>The queue is empty. Add a song above!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {partyState.queue.map((song, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <span style={{ opacity: 0.3, fontSize: '0.8rem', fontWeight: 'bold', width: '20px' }}>{i + 1}</span>
                {song.art ? (
                  <img src={song.art} alt={song.title} style={{ width: '40px', height: '30px', borderRadius: '4px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '40px', height: '30px', borderRadius: '4px', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Music2 size={14} color="var(--text-muted)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                  <p style={{ fontSize: '0.75rem', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                </div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '0.2rem 0.4rem', borderRadius: '4px', background: song.jobStatus?.status === 'ready' ? 'rgba(0,255,0,0.1)' : 'var(--glass-bg)', color: song.jobStatus?.status === 'ready' ? '#4ade80' : 'var(--text-muted)', marginRight: '1rem' }}>
                  {song.jobStatus?.status || 'pending'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                   {song.jobStatus?.status === 'ready' && (
                     <button onClick={() => handlePlayNow(i)} style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '0.25rem', marginRight: '0.25rem' }} title="Play Now">
                         <Play size={18} />
                     </button>
                   )}
                   <button onClick={() => handleReorderSong(i, i - 1)} disabled={i === 0} style={{ background: 'none', border: 'none', color: i === 0 ? 'rgba(255,255,255,0.1)' : 'white', cursor: i === 0 ? 'default' : 'pointer', padding: '0.25rem' }}>
                       <ChevronUp size={20} />
                   </button>
                   <button onClick={() => handleReorderSong(i, i + 1)} disabled={i === partyState.queue.length - 1} style={{ background: 'none', border: 'none', color: i === partyState.queue.length - 1 ? 'rgba(255,255,255,0.1)' : 'white', cursor: i === partyState.queue.length - 1 ? 'default' : 'pointer', padding: '0.25rem' }}>
                       <ChevronDown size={20} />
                   </button>
                   <button onClick={() => handleRemoveSong(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', marginLeft: '0.5rem' }}>
                       <Trash2 size={18} />
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
