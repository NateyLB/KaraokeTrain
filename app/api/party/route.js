import { NextResponse } from 'next/server';
import { partyStore } from '../../../lib/partyStore';
import { jobQueue } from '../../../lib/jobQueue';
import { runBackgroundSeparation } from '../separate/start/route';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Party ID is required' }, { status: 400 });
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
    const body = await request.json();
    const { action, id, song } = body;

    if (!id) return NextResponse.json({ error: 'Party ID required' }, { status: 400 });

    const partyId = id.toUpperCase();
    let updatedParty;

    if (action === 'add') {
      if (!song || !song.videoId) return NextResponse.json({ error: 'Song with videoId required' }, { status: 400 });
      
      const jobId = crypto.randomUUID();
      const uploadDir = path.join(process.cwd(), 'uploads', jobId);
      fs.mkdirSync(uploadDir, { recursive: true });
      jobQueue.set(jobId, { status: 'processing', progress: 0, message: 'Starting job...' });

      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      
      // Start the Demucs and Whisper job instantly in the background!
      runBackgroundSeparation(song, jobId, uploadDir, baseUrl).catch(err => {
        console.error("Background separation error:", err);
        const existing = jobQueue.get(jobId);
        if (existing?.status !== 'error') {
          jobQueue.update(jobId, { status: 'error', error: err.message });
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
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json(updatedParty);

  } catch (error) {
    console.error('Party API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
