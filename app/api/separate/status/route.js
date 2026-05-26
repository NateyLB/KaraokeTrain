import { NextResponse } from 'next/server';
import { jobQueue } from '../../../../lib/jobQueue';
import { isValidJobId } from '../../../../lib/validators';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId || !isValidJobId(jobId)) {
    return NextResponse.json({ error: 'A valid jobId is required' }, { status: 400 });
  }

  const status = jobQueue.get(jobId);
  if (!status) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json(status);
}
