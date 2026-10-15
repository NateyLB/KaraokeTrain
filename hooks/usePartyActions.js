'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PartyClient } from '../lib/party/PartyClient';
import useKaraokeStore from '../store/useKaraokeStore';

/** Queue operations share immediate updates and visible HTTP error feedback. */
export function usePartyActions(roomId, { announceQueued = false } = {}) {
  const client = useMemo(() => new PartyClient(roomId), [roomId]);
  const lifetime = useRef(null);
  useEffect(() => {
    const scope = { roomId, requests: new Set() };
    lifetime.current = scope;
    return () => {
      lifetime.current = null;
      for (const request of scope.requests) request.abort();
      scope.requests.clear();
    };
  }, [roomId]);
  const setPartyState = useKaraokeStore(state => state.setPartyState);
  const setToast = useKaraokeStore(state => state.setToast);
  const perform = useCallback(async (operation, message) => {
    const scope = lifetime.current;
    if (scope?.roomId !== roomId) return null;
    const controller = new AbortController();
    scope.requests.add(controller);
    try {
      const party = await operation({ signal: controller.signal });
      if (controller.signal.aborted || lifetime.current !== scope) return null;
      setPartyState(party);
      if (message) setToast(message);
      return party;
    } catch (error) {
      if (controller.signal.aborted || lifetime.current !== scope) return null;
      if (error.party?.id === roomId) setPartyState(error.party);
      setToast(error.message || 'Unable to update the room.');
      return null;
    } finally { scope.requests.delete(controller); }
  }, [setPartyState, setToast, roomId]);

  return useMemo(() => ({
    addSong: track => perform(options => client.addSong(track, options), announceQueued ? `Added "${track.title}" to queue!` : null),
    removeSong: (index, song) => perform(options => client.send('remove', { index, expectedQueueId: song?.queueId }, options)),
    playNow: (index, song) => perform(options => client.send('playNow', { index, expectedQueueId: song?.queueId }, options)),
    reorderSong: (oldIndex, newIndex, song, target) => perform(options => client.send('reorder', {
      oldIndex, newIndex, expectedQueueId: song?.queueId, expectedTargetQueueId: target?.queueId,
    }, options)),
    nextSong: (song = useKaraokeStore.getState().partyState?.currentSong) => perform(options => client.send('next', { expectedCurrentQueueId: song?.queueId ?? null }, options)),
    previousSong: () => perform(options => client.send('previous', { expectedCurrentQueueId: useKaraokeStore.getState().partyState?.currentSong?.queueId ?? null }, options)),
    remoteCommand: command => perform(options => client.send('remoteControl', { command }, options)),
  }), [client, perform, announceQueued]);
}
