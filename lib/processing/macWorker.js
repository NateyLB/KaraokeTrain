import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { setTimeout as delay } from 'node:timers/promises';

if (!global.karaokeMacWorkerContext) global.karaokeMacWorkerContext = new AsyncLocalStorage();
const context = global.karaokeMacWorkerContext;
export const workerLockPath = path.join(process.cwd(), '.runtime', 'worker.lock');

/** Both development and production use the same Mac GPU and audio workspace. */
export async function withMacWorker(operation, { filename = workerLockPath, timeoutMs = 75 * 60 * 1000 } = {}) {
  if (process.platform !== 'darwin' || context.getStore() === filename) return operation();
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + timeoutMs, id = randomUUID();
  let file;
  while (!file) {
    try { file = await fs.open(filename, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('The Mac processing worker is busy. Please retry.');
      await delay(Math.min(500, Math.max(1, deadline - Date.now())));
    }
  }
  try {
    await file.writeFile(JSON.stringify({ id, pid: process.pid, startedAt: Date.now() }));
    return await context.run(filename, operation);
  } finally {
    await file.close();
    // A crash leaves the lease closed to new work, rather than risking overlap.
    const owner = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (owner.id === id) await fs.unlink(filename);
  }
}
