import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import { AccessStore } from '../lib/access/AccessStore.js';
import { workerLockPath } from '../lib/processing/macWorker.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  name: { type: 'string', default: 'Owner device' }, role: { type: 'string', default: 'host' }, id: { type: 'string' },
} });
const store = new AccessStore(process.env.ACCESS_STATE_PATH || path.join(process.cwd(), '.runtime/access/state.json'));
const command = positionals[0];
if (command === 'pair') {
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin?.startsWith('https://') || new URL(origin).origin !== origin) throw new Error('Set PUBLIC_ORIGIN to the secure server origin.');
  const grant = store.pairing(values.name, values.role);
  const directory = path.join(process.cwd(), '.runtime/access');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const png = path.join(directory, 'pairing.png'), link = path.join(directory, 'pairing-link.txt');
  const url = `${origin}/pair#token=${grant.token}`;
  fs.writeFileSync(png, await QRCode.toBuffer(url, { width: 420, margin: 4 }), { mode: 0o600 });
  fs.writeFileSync(link, url + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ qr: png, linkFile: link, expiresAt: new Date(grant.expiresAt).toISOString(), role: values.role }));
} else if (command === 'list') {
  console.log(JSON.stringify(store.devices().map(({ id, name, role, expiresAt }) => ({ id, name, role, expiresAt })), null, 2));
} else if (command === 'revoke' && values.id) {
  store.revoke(values.id); console.log('Device revoked.');
} else if (['recover-lock', 'recover-worker-lock'].includes(command)) {
  const lock = command === 'recover-worker-lock' ? workerLockPath : `${store.filename}.lock`;
  const contents = fs.readFileSync(lock, 'utf8');
  const pid = command === 'recover-worker-lock' ? JSON.parse(contents).pid : Number(contents);
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Inspect the invalid lock manually.');
  try { process.kill(pid, 0); throw new Error('The writer is still running; the lock was preserved.'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  fs.rmSync(lock); console.log('Removed the stopped writer’s lock.');
} else throw new Error('Usage: tools/access.mjs pair [--name NAME] [--role host|owner] | list | revoke --id ID | recover-lock | recover-worker-lock');
