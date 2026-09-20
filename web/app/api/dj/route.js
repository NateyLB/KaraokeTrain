import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(request) {
  try {
    const body = await request.json();
    const { prompt, history, currentSong, queue } = body;
    
    const sessionDataStr = JSON.stringify({
      prompt: prompt || "What should we sing next?",
      history: history || [],
      currentSong: currentSong || null,
      queue: queue || []
    });

    return new Promise((resolve) => {
      const scriptPath = path.join(process.cwd(), 'lib', 'dj_agent.py');
      const pythonExec = process.env.PYTHON_BIN_PATH || 'venv/bin/python';
      const pythonProcess = spawn(pythonExec, [scriptPath, sessionDataStr], {
        cwd: process.cwd(),
      });

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`DJ Agent exited with code ${code}`);
          console.error(stderrData);
          resolve(NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 }));
          return;
        }

        try {
          const result = JSON.parse(stdoutData.trim());
          if (result.error) {
            resolve(NextResponse.json({ error: result.error }, { status: 500 }));
          } else {
            resolve(NextResponse.json(result));
          }
        } catch (e) {
          console.error("Failed to parse agent output:", stdoutData);
          resolve(NextResponse.json({ error: 'Invalid response from DJ Agent' }, { status: 500 }));
        }
      });
    });

  } catch (error) {
    console.error('DJ API Error:', error);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500 });
  }
}
