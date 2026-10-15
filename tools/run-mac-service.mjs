import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const definitions = {
  api: [process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100']],
  downloader: [process.execPath, ['downloader-api.js']],
  tunnel: ['/opt/homebrew/bin/cloudflared', ['tunnel', '--config', path.join(process.cwd(), '.runtime/cloudflared/config.yml'), 'run']],
};
const name = process.argv[2], definition = definitions[name];
if (!definition) throw new Error('Choose api, downloader or tunnel.');
const directory = path.join(process.cwd(), '.runtime/logs');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
function log(chunk, suffix) {
  const filename = path.join(directory, `${name}.${suffix}.log`), limit = 5 * 1024 * 1024;
  let size = 0;
  try { size = fs.statSync(filename).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (size + chunk.length > limit && size) {
    fs.rmSync(filename + '.1', { force: true }); fs.renameSync(filename, filename + '.1');
  }
  fs.appendFileSync(filename, chunk.subarray(Math.max(0, chunk.length - limit)), { mode: 0o600 });
}
// A dedicated process group lets shutdown also stop Demucs/ASR/yt-dlp children.
const child = spawn(definition[0], definition[1], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
function stopGroup(signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
child.stdout.on('data', chunk => log(chunk, 'output'));
child.stderr.on('data', chunk => log(chunk, 'error'));
child.on('error', () => { log(Buffer.from('Service could not start.\n'), 'error'); process.exitCode = 1; });
child.on('exit', code => { stopGroup('SIGKILL'); process.exitCode = code ?? 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopGroup(signal);
  setTimeout(() => { stopGroup('SIGKILL'); process.exit(1); }, 10000).unref();
});
