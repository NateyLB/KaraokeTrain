'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import useKaraokeStore from '../store/useKaraokeStore';
import { PartyClient } from '../lib/party/PartyClient';
import { SettingsSynchronizer } from '../lib/party/SettingsSynchronizer';

/** Owns one room's setting debounce, SSE subscription, timers and commands. */
export function usePartySync(roomId, role, callbacks = {}) {
  const [connection, setConnection] = useState(null);
  const callbacksRef = useRef(callbacks);
  const settingsSync = useRef(null);
  const client = useMemo(() => new PartyClient(roomId), [roomId]);
  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  useEffect(() => {
    const sync = new SettingsSynchronizer({
      client, role, store: useKaraokeStore,
      onError: error => useKaraokeStore.getState().setToast(error.message),
      apply: patch => {
        for (const [key, value] of Object.entries(patch)) {
          const store = useKaraokeStore.getState();
          if (key === 'isPlaying' && role === 'host' && callbacksRef.current.onTogglePlay) callbacksRef.current.onTogglePlay();
          else store[`set${key[0].toUpperCase()}${key.slice(1)}`](value);
        }
      },
    });
    settingsSync.current = sync;
    return () => { sync.dispose(); settingsSync.current = null; };
  }, [client, role]);

  useEffect(() => {
    let source, reconnect, disposed = false, receivedSnapshot = false;
    let lastCommand = 0;
    const connect = () => {
      if (disposed) return;
      source = new EventSource(`/api/party/stream?id=${encodeURIComponent(roomId)}`);
      source.onmessage = event => {
        if (disposed) return;
        try {
          const party = JSON.parse(event.data);
          if (party.id !== roomId) return;
          setConnection(previous => previous?.roomId === roomId && previous.status === 'connected' ? previous : { roomId, status: 'connected' });
          const store = useKaraokeStore.getState();
          store.setPartyState(party);
          // A new host must not replay the room's historical last command.
          if (!receivedSnapshot) {
            receivedSnapshot = true;
            lastCommand = party.remoteCommand?.timestamp || 0;
          }
          settingsSync.current?.receive(party.settings);
          if (role === 'host' && party.remoteCommand?.timestamp > lastCommand) {
            const command = party.remoteCommand.action;
            const handlers = {
              next: callbacksRef.current.onNextSong, nextSong: callbacksRef.current.onNextSong,
              previous: callbacksRef.current.onPreviousSong, previousSong: callbacksRef.current.onPreviousSong,
              alignStart: callbacksRef.current.onAlignStart, togglePlay: callbacksRef.current.onTogglePlay,
              toggleMic: () => { const state = useKaraokeStore.getState(); state.setMicEnabled(!state.micEnabled); },
              toggleVideo: () => { const state = useKaraokeStore.getState(); state.setIsVideoVisible(!state.isVideoVisible); },
            };
            handlers[command]?.();
            lastCommand = party.remoteCommand.timestamp;
          }
        } catch (error) { console.error('Room synchronization failed:', error); }
      };
      source.onerror = () => {
        source.close();
        if (!disposed) {
          setConnection({ roomId, status: 'reconnecting' });
          reconnect = setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      source?.close();
      clearTimeout(reconnect);
    };
  }, [roomId, role]);

  return connection?.roomId === roomId ? connection.status : 'connecting';
}
