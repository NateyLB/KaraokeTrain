import '../backend/runtime-config.mjs';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 5000);
  timer.unref();
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());

function portOpen(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}
async function healthy(port, path, service) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(2000) });
    return response.ok && (await response.json()).service === service;
  } catch { return false; }
}
async function ensure({ name, port, path, service, args, cwd, env = {} }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid ${name} port.`);
  if (await portOpen(port)) {
    if (!await healthy(port, path, service)) {
      throw new Error(`Port ${port} is occupied, but ${name}'s health check failed. Stop/restart that older or unrelated server; this launcher will not kill it.`);
    }
    console.log(`[dev] Reusing ${name} on port ${port}.`);
    return;
  }
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env, PORT: String(port) } });
  children.add(child);
  let exited = false;
  child.once('error', error => { console.error(`[dev] ${name}: ${error.message}`); exited = true; stop(1); });
  child.once('exit', code => {
    exited = true;
    children.delete(child);
    if (!stopping) { console.error(`[dev] ${name} exited (${code}); stopping companion services.`); stop(1); }
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !stopping && !exited) {
    if (await healthy(port, path, service)) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${name} did not become healthy. Check its error output above.`);
}

try {
  if (!process.env.DOWNLOADER_SECRET) throw new Error('Missing DOWNLOADER_SECRET. Configure the repository .env.local before starting.');
  const backendPort = Number(process.env.PORT || 4000);
  const webPort = Number(process.env.KARAOKE_WEB_PORT || 3000);
  await ensure({ name: 'backend', port: backendPort, path: '/health', service: 'karaoke-downloader',
    args: [fileURLToPath(new URL('../backend/downloader-api.js', import.meta.url))], cwd: root + 'backend' });
  await ensure({ name: 'web', port: webPort, path: '/api/health', service: 'karaoke-web',
    args: [require.resolve('next/dist/bin/next'), 'dev', root + 'web', '--webpack', '-H', '0.0.0.0', '-p', String(webPort)], cwd: root + 'web',
    // Local testing must not depend on the production downloader's tunnel.
    env: { DOWNLOADER_API_URL: `http://127.0.0.1:${backendPort}` } });
  console.log(`[dev] Both services ready: web :${webPort}, backend :${backendPort}. Keep this terminal open while testing iOS.`);
} catch (error) {
  console.error(`[dev] ${error.message}`);
  stop(1);
}
