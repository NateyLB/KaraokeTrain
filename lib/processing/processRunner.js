/** A bounded subprocess that owns its timeout, output buffers and termination. */
export async function runProcess(command, args, { timeoutMs = 15 * 60 * 1000, maxOutput = 65536, onStdout, onStderr } = {}) {
  const { spawn } = await import(/* webpackIgnore: true */ 'node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ command, args);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '', stderr = '', timedOut = false, killTimer;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      killTimer.unref?.();
    }, timeoutMs);
    timeout.unref?.();
    const cleanup = () => { clearTimeout(timeout); clearTimeout(killTimer); };
    child.stdout.on('data', data => { const text = data.toString(); stdout = (stdout + text).slice(-maxOutput); onStdout?.(text); });
    child.stderr.on('data', data => { const text = data.toString(); stderr = (stderr + text).slice(-maxOutput); onStderr?.(text); });
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (timedOut) reject(new Error(`${command} timed out.`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}
