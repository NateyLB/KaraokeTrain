import { withAccess, roomAccess, streamLease } from '../../../../lib/access/server.js';
export const dynamic = 'force-dynamic';

import { partyStore } from '../../../../lib/party/partyStore';
import { jobQueue } from '../../../../lib/processing/jobQueue';
import { partyPayload } from '../../../../lib/party/payload';
import { isValidPartyId } from '../../../../lib/http/validators';

async function handleGET(request, principal) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !isValidPartyId(id)) {
    return Response.json({ error: 'A valid Party ID is required' }, { status: 400 });
  }

  roomAccess(principal, id, 'read');
  const partyId = id.toUpperCase();
  const lease = streamLease(request, principal, partyId);
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const eventName = `update:${partyId}`;
      let closed = false;
      let pingInterval;
      let unsubscribeJobs = () => {};

      const send = text => {
        if (closed) return;
        if (!lease.valid()) { cleanup(); return; }
        try { controller.enqueue(encoder.encode(text)); }
        catch { cleanup(); }
      };
      const sendParty = party => send(`data: ${JSON.stringify(partyPayload(party))}\n\n`);
      const onUpdate = party => sendParty(party);
      cleanup = () => {
        if (closed) return;
        closed = true;
        lease.close();
        clearInterval(pingInterval);
        unsubscribeJobs();
        global.partyEvents?.off(eventName, onUpdate);
        request.signal.removeEventListener('abort', cleanup);
        try { controller.close(); } catch { /* already cancelled */ }
      };

      if (request.signal.aborted) { cleanup(); return; }
      request.signal.addEventListener('abort', cleanup, { once: true });
      global.partyEvents?.on(eventName, onUpdate);
      unsubscribeJobs = jobQueue.subscribe(jobId => {
        const party = partyStore.get(partyId);
        if (party.currentSong?.jobId === jobId || party.queue.some(song => song.jobId === jobId)) {
          sendParty(party);
        }
      });
      sendParty(partyStore.get(partyId));
      if (!closed) pingInterval = setInterval(() => send(': ping\n\n'), 15000);
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}

export const GET = withAccess(['owner', 'host', 'guest'], handleGET);
