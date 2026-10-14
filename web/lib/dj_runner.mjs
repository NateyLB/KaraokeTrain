import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function runDJ(session, { cwd = process.cwd(), launch = spawn, timeoutMs = 80000 } = {}) {
  const python = process.env.PYTHON_BIN_PATH || [
    path.join(cwd, 'venv/bin/python3'), path.resolve(cwd, '../backend/venv/bin/python3'),
  ].find(existsSync) || 'python3';
  return new Promise((resolve, reject) => {
    const child = launch(python, [path.join(cwd, 'lib/dj_agent.py'), JSON.stringify(session)], { cwd });
    let output = '', settled = false;
    const finish = (error, data) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(data);
    };
    const timer = setTimeout(() => { finish(new Error('The DJ timed out. Please retry.')); child.kill('SIGKILL'); }, timeoutMs);
    child.once('error', () => finish(new Error('The DJ could not start. Check the server Python environment.')));
    child.stdout.on('data', bytes => {
      output += bytes.toString();
      if (output.length > 1024 * 1024) { finish(new Error('DJ response exceeded the limit.')); child.kill('SIGKILL'); }
    });
    child.stderr.resume();
    child.once('close', code => {
      if (code !== 0) return finish(new Error('The DJ failed. Check its server dependencies and credentials.'));
      try {
        const data = JSON.parse(output);
        if (typeof data.message !== 'string' || !Array.isArray(data.recommended_queries) ||
            !data.recommended_queries.every(value => typeof value === 'string')) throw new Error();
        finish(null, data);
      } catch { finish(new Error('The DJ returned an invalid response.')); }
    });
  });
}
