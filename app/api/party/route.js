import { checkCache } from '../../../lib/storage/index.js';
import { withAccess, roomAccess, accessEnabled, limitAccess } from '../../../lib/access/server.js';
import { NextResponse } from 'next/server';
import { partyStore } from '../../../lib/party/partyStore';
import { songProcessing } from '../../../lib/processing/index';
import { isValidVideoId, isValidPartyId } from '../../../lib/http/validators';
import { checkRateLimit, getClientIp } from '../../../lib/http/rateLimiter';
import { partyPayload } from '../../../lib/party/payload';
import { readJsonObject } from '../../../lib/http/requestBody';
import { randomUUID } from 'node:crypto';
import { validatedSettings, REMOTE_COMMANDS } from '../../../lib/party/settings';

const MAX_QUEUE_SIZE = 20;

async function handleGET(request, principal) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !isValidPartyId(id)) {
    return NextResponse.json({ error: 'A valid Party ID is required' }, { status: 400 });
  }

  roomAccess(principal, id, 'read');
  const party = partyStore.get(id.toUpperCase());
  
  return NextResponse.json(partyPayload(party));
}

async function handlePOST(request, principal) {
  let requestedPartyId;
  try {
    // Rate limit by IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`party:${clientIp}`, { maxRequests: 30, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
    }

    const body = await readJsonObject(request);
    const { action, id, song } = body;

    if (!id || !isValidPartyId(id)) {
      return NextResponse.json({ error: 'A valid Party ID is required' }, { status: 400 });
    }

    roomAccess(principal, id, action === 'add' ? 'add' : 'control');
    const partyId = id.toUpperCase();
    requestedPartyId = partyId;
    let updatedParty;

    if (action === 'add') {
      if (!song || !song.videoId) return NextResponse.json({ error: 'Song with videoId required' }, { status: 400 });
      
      // SECURITY: Validate videoId format before processing
      if (!isValidVideoId(song.videoId)) {
        return NextResponse.json({ error: 'Invalid video ID format' }, { status: 400 });
      }

      // Prevent queue flooding
      const currentParty = partyStore.get(partyId);
      if (currentParty.queue.length >= MAX_QUEUE_SIZE) {
        return NextResponse.json({ error: `Queue is full (max ${MAX_QUEUE_SIZE} songs)` }, { status: 429 });
      }

      const cleanSong = {
        videoId: song.videoId,
        title: typeof song.title === 'string' ? song.title.slice(0, 300) : 'Unknown title',
        artist: typeof song.artist === 'string' ? song.artist.slice(0, 200) : 'Unknown artist',
        art: `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`,
      };
      if (accessEnabled() && !await checkCache(cleanSong.videoId)) limitAccess(`queue-add:${principal.id}`, principal.role === 'guest' ? 3 : 20, 60 * 60 * 1000);
      await songProcessing.start(cleanSong);
      const jobId = song.videoId;

      const newSong = {
        ...cleanSong,
        jobId,
        queueId: randomUUID(),
        addedAt: Date.now()
      };
      
      updatedParty = partyStore.addSong(partyId, newSong);
      
      // If nothing is playing, instantly advance the queue so it starts playing immediately
      if (!updatedParty.currentSong) {
          updatedParty = partyStore.nextSong(partyId);
      }
      
    } else if (action === 'next') {
      updatedParty = partyStore.nextSong(partyId, body.expectedCurrentQueueId);
    } else if (action === 'previous') {
      updatedParty = partyStore.previousSong(partyId, body.expectedCurrentQueueId);
    } else if (action === 'remove') {
      const { index } = body;
      updatedParty = partyStore.removeSong(partyId, index, body.expectedQueueId);
    } else if (action === 'reorder') {
      const { oldIndex, newIndex } = body;
      updatedParty = partyStore.reorderSong(partyId, oldIndex, newIndex, body.expectedQueueId, body.expectedTargetQueueId);
    } else if (action === 'playNow') {
      const { index } = body;
      updatedParty = partyStore.playNow(partyId, index, body.expectedQueueId);
    } else if (action === 'updateSettings') {
      const { settings, sender } = body;
      if (!['host', 'remote'].includes(sender)) return NextResponse.json({ error: 'A valid sender is required' }, { status: 400 });
      let validated;
      try { validated = validatedSettings(settings); } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      updatedParty = partyStore.updateSettings(partyId, validated, sender);
    } else if (action === 'remoteControl') {
      const { command } = body;
      if (!REMOTE_COMMANDS.has(command)) return NextResponse.json({ error: 'A valid command is required' }, { status: 400 });
      updatedParty = partyStore.setRemoteCommand(partyId, command);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(partyPayload(updatedParty));

  } catch (error) {
    // SECURITY: Don't leak internal error details to the client
    console.error('Party API Error:', error);
    return NextResponse.json({
      error: error.status >= 400 && error.status < 500 ? error.message : 'An internal error occurred',
      ...(error.status === 409 && requestedPartyId ? { party: partyPayload(partyStore.get(requestedPartyId)) } : {}),
    }, { status: error.status || 500 });
  }
}

export const GET = withAccess(['owner', 'host', 'guest'], handleGET);

export const POST = withAccess(['owner', 'host', 'guest'], handlePOST);
