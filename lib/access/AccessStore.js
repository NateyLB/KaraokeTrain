import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const csrfFor = token => digest(`karaoketrain-csrf:${token}`);
export const accessError = (message, status = 403) => Object.assign(new Error(message), { status });
const tokenValue = () => randomBytes(32).toString('base64url');
const hours = n => n * 60 * 60 * 1000;

/** One Mac mini, one durable credential store. CLI writes share the same lock. */
export class AccessStore {
  constructor(filename, now = Date.now) { this.filename = filename; this.now = now; }

  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (data.version !== 1 || !data.devices || !data.grants || !data.rooms) throw new Error('Invalid access store');
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, devices: {}, grants: {}, rooms: {} };
      throw accessError('Access storage is unavailable.', 503);
    }
  }

  transaction(change) {
    const directory = path.dirname(this.filename), lock = `${this.filename}.lock`;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    let descriptor;
    try { descriptor = fs.openSync(lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw accessError('Access storage is busy. Please retry.', 503); throw error; }
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(descriptor, String(process.pid));
      const data = this.read(), now = this.now();
      for (const collection of [data.devices, data.grants, data.rooms]) {
        for (const [key, entry] of Object.entries(collection)) if (entry.expiresAt <= now) delete collection[key];
      }
      const result = change(data);
      fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
      const file = fs.openSync(temporary, 'r');
      try { fs.fsyncSync(file); } finally { fs.closeSync(file); }
      fs.renameSync(temporary, this.filename);
      return result;
    } finally {
      fs.closeSync(descriptor);
      fs.rmSync(temporary, { force: true });
      fs.rmSync(lock, { force: true });
    }
  }

  authenticate(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const data = this.read(), device = data.devices[digest(token)];
    if (!device || device.expiresAt <= this.now()) return null;
    const rooms = Object.fromEntries(Object.entries(device.rooms || {}).filter(([id, membership]) =>
      membership.expiresAt > this.now() && data.rooms[id]?.instance === membership.instance && data.rooms[id].expiresAt > this.now())
      .map(([id, membership]) => [id, membership.instance]));
    if (device.role === 'guest' && !Object.keys(rooms).length) return null;
    return { ...device, rooms };
  }

  pairing(name, role = 'host', issuerId) {
    if (!['owner', 'host'].includes(role)) throw accessError('Invalid device role.', 400);
    return this.transaction(data => {
      if (Object.keys(data.grants).length >= 2000) throw accessError('Too many active invitations.', 429);
      const token = tokenValue(), expiresAt = this.now() + 10 * 60 * 1000;
      data.grants[digest(token)] = { kind: 'pair', role, issuerId, name: String(name || 'Paired device').slice(0, 80), expiresAt, remaining: 1 };
      return { token, expiresAt };
    });
  }

  room(principal, roomId, permission = 'read') {
    if (!/^[A-Z0-9]{4}$/.test(roomId || '')) throw accessError('A valid room code is required.', 400);
    return this.transaction(data => {
      let room = data.rooms[roomId];
      if (!room) {
        if (!['owner', 'host'].includes(principal.role)) throw accessError('A room invitation is required.');
        if (Object.values(data.rooms).filter(entry => entry.ownerId === principal.id).length >= 10 || Object.keys(data.rooms).length >= 200) {
          throw accessError('Too many active rooms.', 429);
        }
        room = data.rooms[roomId] = { ownerId: principal.id, instance: randomUUID(), expiresAt: this.now() + hours(12) };
      }
      const host = principal.role === 'owner' || room.ownerId === principal.id;
      if (!host && principal.rooms?.[roomId] !== room.instance) throw accessError('An invitation for this room is required.');
      if (!host && !['read', 'add'].includes(permission)) throw accessError('Only the host can control this room.');
      return { ...room, host };
    });
  }

  invitation(principal, roomId) {
    this.room(principal, roomId, 'control');
    return this.transaction(data => {
      if (Object.keys(data.grants).length >= 2000) throw accessError('Too many active invitations.', 429);
      const room = data.rooms[roomId], token = tokenValue(), expiresAt = Math.min(room.expiresAt, this.now() + hours(2));
      data.grants[digest(token)] = { kind: 'invite', roomId, instance: room.instance, issuerId: principal.id, expiresAt, remaining: 32 };
      return { token, expiresAt, roomId };
    });
  }

  redeem(token, name, existingToken) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw accessError('This link is invalid or expired.', 400);
    return this.transaction(data => {
      const key = digest(token), grant = data.grants[key];
      if (!grant || grant.remaining <= 0) throw accessError('This link is invalid, used or expired.', 410);
      if (grant.issuerId && !Object.values(data.devices).some(device => device.id === grant.issuerId && device.expiresAt > this.now())) {
        throw accessError('This invitation has been revoked.', 410);
      }
      const existing = existingToken && data.devices[digest(existingToken)];
      if (grant.kind === 'invite' && (data.rooms[grant.roomId]?.instance !== grant.instance ||
          !Object.values(data.devices).some(device => device.id === grant.issuerId && device.expiresAt > this.now()))) {
        throw accessError('This room invitation has been revoked.', 410);
      }
      const reuse = grant.kind === 'invite' && existing?.expiresAt > this.now();
      if (!reuse && Object.keys(data.devices).length >= 500) throw accessError('Too many paired devices.', 429);
      const deviceToken = reuse ? existingToken : tokenValue();
      const device = reuse ? existing : {
        id: randomUUID(), name: String(name || grant.name || 'Guest device').slice(0, 80),
        role: grant.kind === 'pair' ? grant.role : 'guest', rooms: {},
        createdAt: this.now(), expiresAt: grant.kind === 'pair' ? this.now() + hours(24 * 180) : grant.expiresAt,
      };
      if (grant.kind === 'invite') device.rooms[grant.roomId] = { instance: grant.instance, expiresAt: grant.expiresAt };
      data.devices[digest(deviceToken)] = device;
      if (--grant.remaining <= 0) delete data.grants[key];
      return { token: deviceToken, principal: device, roomId: grant.roomId };
    });
  }

  devices() { return Object.values(this.read().devices).filter(device => device.expiresAt > this.now()); }

  revoke(id) {
    this.transaction(data => {
      for (const [key, device] of Object.entries(data.devices)) if (device.id === id) delete data.devices[key];
      for (const [key, grant] of Object.entries(data.grants)) if (grant.issuerId === id) delete data.grants[key];
      for (const [key, room] of Object.entries(data.rooms)) if (room.ownerId === id) delete data.rooms[key];
    });
  }

  revokeGuests(principal, roomId) {
    this.room(principal, roomId, 'control');
    this.transaction(data => {
      data.rooms[roomId].instance = randomUUID();
      for (const [key, grant] of Object.entries(data.grants)) {
        if (grant.kind === 'invite' && grant.roomId === roomId) delete data.grants[key];
      }
    });
  }
}
