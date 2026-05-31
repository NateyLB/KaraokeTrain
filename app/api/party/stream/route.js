export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { partyStore } from '../../../../lib/partyStore';
import { jobQueue } from '../../../../lib/jobQueue';
import { isValidPartyId } from '../../../../lib/validators';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !isValidPartyId(id)) {
    return NextResponse.json({ error: 'A valid Party ID is required' }, { status: 400 });
  }

  const partyId = id.toUpperCase();

  const stream = new ReadableStream({
    start(controller) {
      // Helper to serialize and push data
      const sendParty = (party) => {
        const queueWithStatus = party.queue.map(song => ({
          ...song,
          jobStatus: jobQueue.get(song.jobId) || { status: 'pending' }
        }));
        
        const currentSongWithStatus = party.currentSong ? {
          ...party.currentSong,
          jobStatus: jobQueue.get(party.currentSong.jobId) || { status: 'pending' }
        } : null;

        const payload = {
          ...party,
          queue: queueWithStatus,
          currentSong: currentSongWithStatus
        };

        controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // 1. Immediately send the current state upon connection
      sendParty(partyStore.get(partyId));

      // 2. Listen for future updates
      const eventName = `update:${partyId}`;
      const onUpdate = (updatedParty) => {
        sendParty(updatedParty);
      };

      if (global.partyEvents) {
        global.partyEvents.on(eventName, onUpdate);
      }

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        if (global.partyEvents) {
          global.partyEvents.off(eventName, onUpdate);
        }
        try { controller.close(); } catch (e) {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
