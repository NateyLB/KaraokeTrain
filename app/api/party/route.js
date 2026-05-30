import { NextResponse } from 'next/server';
import { partyStore } from '../../../lib/partyStore';
import { jobQueue } from '../../../lib/jobQueue';
import { runBackgroundSeparation } from '../separate/start/route';
import { isValidVideoId, isValidPartyId } from '../../../lib/validators';
import { checkRateLimit, canStartJob } from '../../../lib/rateLimiter';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_QUEUE_SIZE = 20;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id || !isValidPartyId(id)) {
    return NextResponse.json({ error: 'A valid Party ID is required' }, { status: 400 });
  }

  const party = partyStore.get(id.toUpperCase());
  
  // Attach current demucs job status to the queue items
  const queueWithStatus = party.queue.map(song => ({
    ...song,
    jobStatus: jobQueue.get(song.jobId) || { status: 'pending' }
  }));
  
  const currentSongWithStatus = party.currentSong ? {
    ...party.currentSong,
    jobStatus: jobQueue.get(party.currentSong.jobId) || { status: 'pending' }
  } : null;

  return NextResponse.json({ 
    ...party, 
    queue: queueWithStatus,
    currentSong: currentSongWithStatus
  });
}

export async function POST(request) {
  try {
    // Rate limit by IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
                   || request.headers.get('x-real-ip') 
                   || 'unknown';
    const rateCheck = checkRateLimit(`party:${clientIp}`, { maxRequests: 30, windowMs: 60000 });
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const { action, id, song } = body;

    if (!id || !isValidPartyId(id)) {
      return NextResponse.json({ error: 'A valid Party ID is required' }, { status: 400 });
    }

    const partyId = id.toUpperCase();
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

      // Run the background separation natively without an HTTP fetch loopback.
      // Since we use --no-cpu-throttling in Cloud Run, the container stays alive.
      const baseUrl = process.env.INTERNAL_BASE_URL || new URL(request.url).origin;
      const jobId = song.videoId;
      const uploadDir = path.join(process.cwd(), 'uploads', jobId);
      fs.mkdirSync(uploadDir, { recursive: true });
      jobQueue.set(jobId, { status: 'processing', progress: 0, message: 'Starting job...' });
      
      runBackgroundSeparation({ videoId: song.videoId, title: song.title, artist: song.artist }, jobId, uploadDir, baseUrl).catch(err => {
        console.error("Background separation error:", err);
        const existing = jobQueue.get(jobId);
        if (existing?.status !== 'error') {
          jobQueue.update(jobId, { status: 'error', error: 'Processing failed. Please try again.' });
        }
      });

      const newSong = {
        ...song,
        jobId,
        addedAt: Date.now()
      };
      
      updatedParty = partyStore.addSong(partyId, newSong);
      
      // If nothing is playing, instantly advance the queue so it starts playing immediately
      if (!updatedParty.currentSong) {
          updatedParty = partyStore.nextSong(partyId);
      }
      
    } else if (action === 'next') {
      updatedParty = partyStore.nextSong(partyId);
    } else if (action === 'remove') {
      const { index } = body;
      if (typeof index !== 'number') return NextResponse.json({ error: 'Index required' }, { status: 400 });
      updatedParty = partyStore.removeSong(partyId, index);
    } else if (action === 'reorder') {
      const { oldIndex, newIndex } = body;
      if (typeof oldIndex !== 'number' || typeof newIndex !== 'number') return NextResponse.json({ error: 'Indices required' }, { status: 400 });
      updatedParty = partyStore.reorderSong(partyId, oldIndex, newIndex);
    } else if (action === 'playNow') {
      const { index } = body;
      if (typeof index !== 'number') return NextResponse.json({ error: 'Index required' }, { status: 400 });
      updatedParty = partyStore.playNow(partyId, index);
    } else if (action === 'updateSettings') {
      const { settings, sender } = body;
      if (!settings || !sender) return NextResponse.json({ error: 'Settings and sender required' }, { status: 400 });
      updatedParty = partyStore.updateSettings(partyId, settings, sender);
    } else if (action === 'remoteControl') {
      const { command } = body;
      if (!command) return NextResponse.json({ error: 'Command required' }, { status: 400 });
      updatedParty = partyStore.setRemoteCommand(partyId, command);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(updatedParty);

  } catch (error) {
    // SECURITY: Don't leak internal error details to the client
    console.error('Party API Error:', error);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}
