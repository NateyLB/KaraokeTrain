import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const stem = searchParams.get('stem');

  if (!jobId || !stem) {
    return new NextResponse('Missing parameters', { status: 400 });
  }

  // Demucs outputs to: uploads/jobId/htdemucs/input/{stem}.wav
  // Notice that 'input' is the basename of our input.m4a file
  const stemPath = path.join(process.cwd(), 'uploads', jobId, 'htdemucs', 'input', `${stem}.wav`);

  if (!fs.existsSync(stemPath)) {
    return new NextResponse('Stem not found', { status: 404 });
  }

  const stat = fs.statSync(stemPath);
  const fileSize = stat.size;
  const range = request.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(stemPath, { start, end });

    return new NextResponse(file, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/wav',
      },
    });
  } else {
    const file = fs.createReadStream(stemPath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Length': fileSize,
        'Content-Type': 'audio/wav',
      },
    });
  }
}
