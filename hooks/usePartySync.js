'use client';
import { useEffect, useRef } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';

/**
 * Unified sync hook for both Host and Remote.
 * Handles: outbound setting sync, inbound polling, race condition guard, remote commands.
 * 
 * @param {string} roomId - The party room ID
 * @param {'host'|'remote'} role - Which side this is
 * @param {object} callbacks - Host-only callbacks: { onTogglePlay, onNextSong, onAlignStart, onStartListening, onStopListening }
 */
export function usePartySync(roomId, role, callbacks = {}) {
  const lastSyncedSettingsTimestamp = useRef(0);
  const lastProcessedCommandTimestamp = useRef(0);
  const syncTimeoutRef = useRef(null);
  const isSyncingFromServer = useRef(false);
  const lastLocalInteractionTimestamp = useRef(0);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const otherRole = role === 'host' ? 'remote' : 'host';

  // Sync local settings UP to the server (debounced 300ms)
  const syncSettingsToServer = (settings) => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch('/api/party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateSettings',
          id: roomId,
          sender: role,
          settings
        })
      }).catch(err => console.error('Sync error', err));
    }, 300);
  };

  // Watch for local setting changes -> sync to server
  const { isPlaying, lyricsOffset, vocalsEnabled, vocalsVolume, micEnabled, micVolume, echoOn, autoTuneOn, isVideoVisible } = useKaraokeStore();

  useEffect(() => {
    if (isSyncingFromServer.current) return;
    lastLocalInteractionTimestamp.current = Date.now();
    syncSettingsToServer({
      isPlaying, lyricsOffset, vocalsEnabled, vocalsVolume,
      micEnabled, micVolume, echoOn, autoTuneOn, isVideoVisible
    });
  }, [isPlaying, lyricsOffset, vocalsEnabled, vocalsVolume, micEnabled, micVolume, echoOn, autoTuneOn, isVideoVisible]);

  // Poll server every 1.5s
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/party?id=${roomId}`);
        if (!res.ok) return;
        const data = await res.json();

        useKaraokeStore.getState().setPartyState(data);

        // Apply settings from the OTHER role
        if (data.settings && data.settings.timestamp > lastSyncedSettingsTimestamp.current) {
          if (data.settings.lastUpdatedBy === otherRole) {
            // Race condition fix: ignore if we just interacted locally
            if (Date.now() - lastLocalInteractionTimestamp.current < 2000) return;

            isSyncingFromServer.current = true;
            const s = data.settings;
            const st = useKaraokeStore.getState();

            if (s.lyricsOffset !== undefined) st.setLyricsOffset(s.lyricsOffset);
            if (s.vocalsEnabled !== undefined) st.setVocalsEnabled(s.vocalsEnabled);
            if (s.vocalsVolume !== undefined) st.setVocalsVolume(s.vocalsVolume);
            if (s.echoOn !== undefined) st.setEchoOn(s.echoOn);
            if (s.autoTuneOn !== undefined) st.setAutoTuneOn(s.autoTuneOn);
            if (s.isVideoVisible !== undefined) st.setIsVideoVisible(s.isVideoVisible);

            // Mic: on host, call start/stopListening; on remote, just set state
            if (s.micEnabled !== undefined) {
              if (role === 'host') {
                if (s.micEnabled && callbacksRef.current.onStartListening) callbacksRef.current.onStartListening();
                else if (!s.micEnabled && callbacksRef.current.onStopListening) callbacksRef.current.onStopListening();
              } else {
                st.setMicEnabled(s.micEnabled);
              }
            }
            if (s.micVolume !== undefined) st.setMicVolume(s.micVolume);

            // Play/Pause: on host, call togglePlay; on remote, just set state
            if (s.isPlaying !== undefined && s.isPlaying !== st.isPlaying) {
              if (role === 'host' && callbacksRef.current.onTogglePlay) {
                callbacksRef.current.onTogglePlay();
              } else {
                st.setIsPlaying(s.isPlaying);
              }
            }

            setTimeout(() => { isSyncingFromServer.current = false; }, 50);
          }
          lastSyncedSettingsTimestamp.current = data.settings.timestamp;
        }

        // Process remote commands (host-only)
        if (role === 'host' && data.remoteCommand && data.remoteCommand.timestamp > lastProcessedCommandTimestamp.current) {
          const cmd = data.remoteCommand.action;
          if (cmd === 'nextSong' && callbacksRef.current.onNextSong) callbacksRef.current.onNextSong();
          if (cmd === 'next' && callbacksRef.current.onNextSong) callbacksRef.current.onNextSong();
          if (cmd === 'alignStart' && callbacksRef.current.onAlignStart) callbacksRef.current.onAlignStart();
          lastProcessedCommandTimestamp.current = data.remoteCommand.timestamp;
        }
      } catch (err) {
        console.error(`${role} sync loop error:`, err);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1500);
    return () => clearInterval(interval);
  }, [roomId, role, otherRole]);
}
