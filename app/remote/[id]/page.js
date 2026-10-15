"use client";

import { use } from 'react';
import { useAccess } from '../../../components/access/AccessBoundary';
import RemoteQueueDrawer from '../../../components/queue/RemoteQueueDrawer';
import SearchBar from '../../../components/SearchBar';
import RemoteControls from '../../../components/RemoteControls';
import { usePartySync } from '../../../hooks/usePartySync';
import { usePartyActions } from '../../../hooks/usePartyActions';
import OverlayButtons from '../../../components/OverlayButtons';

export default function RemotePage({ params }) {
  const access = useAccess();
  const unwrappedParams = use(params);
  const roomId = unwrappedParams.id.toUpperCase();

  // Sync with server
  const connection = usePartySync(roomId, 'remote');

  const { addSong: handleQueueSong } = usePartyActions(roomId, { announceQueued: true });

  return (
    <div style={{ padding: '0.5rem', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '100vh', paddingBottom: '100px', position: 'relative', width: '100%', maxWidth: '100vw', boxSizing: 'border-box', overflowX: 'hidden' }}>
      
      {/* Remote Context Info Toggle */}
      <OverlayButtons roomId={roomId} context="remote" showSearchButton={false} />

      <header style={{ textAlign: 'center', marginTop: '0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
        <p role="status" className="body-text" style={{ opacity: 0.6, fontSize: '0.8rem', margin: 0 }}>{connection === 'connected' ? 'Connected to Room' : connection === 'reconnecting' ? 'Reconnecting to Room…' : 'Connecting to Room…'}</p>
        <h1 className="text-gradient" style={{ letterSpacing: '0.1rem', fontSize: '1.1rem', margin: 0, fontWeight: 700 }}>{roomId}</h1>
      </header>

      {/* Search Area */}
      <div>
         <SearchBar onSelect={handleQueueSong} defaultCatalogOpen={false} />
      </div>

      {/* Remote Playback Controls */}
      {access.role !== 'guest' && <RemoteControls roomId={roomId} />}

      <div style={{ flex: 1 }}></div>

      <RemoteQueueDrawer roomId={roomId} />

    </div>
  );
}
