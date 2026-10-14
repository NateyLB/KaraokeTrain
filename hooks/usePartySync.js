'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import useKaraokeStore from '../store/useKaraokeStore';
import { PartyClient } from '../lib/party/PartyClient';
import { selectSyncedSettings, SYNCED_SETTING_KEYS } from '../lib/party/settings';

/** Owns one room's setting debounce, SSE subscription, timers and commands. */
export function usePartySync(roomId, role, callbacks = {}) {
  const [connection, setConnection] = useState(null);
  const callbacksRef = useRef(callbacks);
  const serverUpdate = useRef(false);
  const lastInteraction = useRef(0);
  const initialMount = useRef(true);
  const client = useMemo(() => new PartyClient(roomId), [roomId]);
  const settings = useKaraokeStore(useShallow(selectSyncedSettings));
  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  useEffect(() => {
    initialMount.current = true;
    serverUpdate.current = false;
    lastInteraction.current = 0;
  }, [roomId, role]);

  useEffect(() => {
    if (initialMount.current) { initialMount.current = false; return; }
    if (serverUpdate.current) return;
    lastInteraction.current = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      client.send('updateSettings', { sender: role, settings }, { signal: controller.signal }).catch(error => {
        if (!controller.signal.aborted) useKaraokeStore.getState().setToast(error.message);
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [settings, client, role]);

  useEffect(() => {
    let source, reconnect, resetFlag, disposed = false, receivedSnapshot = false;
    let lastSettings = 0, lastCommand = 0;
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
          const incoming = party.settings;
          if (incoming && incoming.timestamp > lastSettings) {
            if (incoming.lastUpdatedBy !== role && Date.now() - lastInteraction.current >= 2000) {
              serverUpdate.current = true;
              for (const key of SYNCED_SETTING_KEYS) {
                if (incoming[key] === undefined || incoming[key] === store[key]) continue;
                if (key === 'isPlaying' && role === 'host' && callbacksRef.current.onTogglePlay) callbacksRef.current.onTogglePlay();
                else store[`set${key[0].toUpperCase()}${key.slice(1)}`](incoming[key]);
              }
              clearTimeout(resetFlag);
              resetFlag = setTimeout(() => { serverUpdate.current = false; }, 50);
            }
            lastSettings = incoming.timestamp;
          }
          if (role === 'host' && party.remoteCommand?.timestamp > lastCommand) {
            const command = party.remoteCommand.action;
            const handlers = {
              next: callbacksRef.current.onNextSong, nextSong: callbacksRef.current.onNextSong,
              previous: callbacksRef.current.onPreviousSong, previousSong: callbacksRef.current.onPreviousSong,
              alignStart: callbacksRef.current.onAlignStart, togglePlay: callbacksRef.current.onTogglePlay,
              toggleMic: () => store.setMicEnabled(!store.micEnabled),
              toggleVideo: () => store.setIsVideoVisible(!store.isVideoVisible),
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
      clearTimeout(resetFlag);
      serverUpdate.current = false;
    };
  }, [roomId, role]);

  return connection?.roomId === roomId ? connection.status : 'connecting';
}
