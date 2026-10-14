'use client';

import { useCallback, useMemo } from 'react';
import { PartyClient } from '../lib/party/PartyClient';
import useKaraokeStore from '../store/useKaraokeStore';

/** Queue operations share immediate updates and visible HTTP error feedback. */
export function usePartyActions(roomId, { announceQueued = false } = {}) {
  const client = useMemo(() => new PartyClient(roomId), [roomId]);
  const setPartyState = useKaraokeStore(state => state.setPartyState);
  const setToast = useKaraokeStore(state => state.setToast);
  const perform = useCallback(async (operation, message) => {
    try {
      const party = await operation();
      setPartyState(party);
      if (message) setToast(message);
      return party;
    } catch (error) {
      if (error.party?.id === roomId) setPartyState(error.party);
      setToast(error.message || 'Unable to update the room.');
      return null;
    }
  }, [setPartyState, setToast, roomId]);

  return useMemo(() => ({
    addSong: track => perform(() => client.addSong(track), announceQueued ? `Added "${track.title}" to queue!` : null),
    removeSong: (index, song) => perform(() => client.send('remove', { index, expectedQueueId: song?.queueId })),
    playNow: (index, song) => perform(() => client.send('playNow', { index, expectedQueueId: song?.queueId })),
    reorderSong: (oldIndex, newIndex, song, target) => perform(() => client.send('reorder', {
      oldIndex, newIndex, expectedQueueId: song?.queueId, expectedTargetQueueId: target?.queueId,
    })),
    nextSong: (song = useKaraokeStore.getState().partyState?.currentSong) => perform(() => client.send('next', { expectedCurrentQueueId: song?.queueId ?? null })),
    previousSong: () => perform(() => client.send('previous', { expectedCurrentQueueId: useKaraokeStore.getState().partyState?.currentSong?.queueId ?? null })),
    remoteCommand: command => perform(() => client.send('remoteControl', { command })),
  }), [client, perform, announceQueued]);
}
