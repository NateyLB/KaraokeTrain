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

      // Use an internal fetch to reliably trigger the background separation, bypassing the need for the client to do it.
      // This solves issues with cached old JS clients, or if the client closes the browser too quickly.
      const baseUrl = process.env.INTERNAL_BASE_URL || 'http://127.0.0.1:3000';
      fetch(`${baseUrl}/api/separate/start?videoId=${encodeURIComponent(song.videoId)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`)
        .catch(err => console.error("Internal background trigger failed:", err));

      const jobId = song.videoId;

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
