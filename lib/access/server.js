import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { AccessStore, accessError, csrfFor } from './AccessStore.js';
import { checkRateLimit, getClientIp } from '../http/rateLimiter.js';

export const accessStore = new AccessStore(process.env.ACCESS_STATE_PATH || path.join(process.cwd(), '.runtime', 'access', 'state.json'));
export const COOKIE = '__Host-kt_device';
const localPrincipal = { id: 'local-development', role: 'owner', rooms: {} };

export function accessEnabled() {
  if (process.env.ACCESS_MODE === 'paired') {
    const origin = process.env.PUBLIC_ORIGIN;
    if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) throw accessError('Secure access is not configured.', 503);
    return true;
  }
  if (process.env.NODE_ENV === 'production' || process.env.PUBLIC_ORIGIN) throw accessError('Secure access must be enabled.', 503);
  return false;
}

export function requestToken(request) {
  const authorization = request.headers.get('authorization');
  if (authorization) return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const values = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : '';
}

export function checkMutation(request, token = '') {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site');
  if ((origin && origin !== process.env.PUBLIC_ORIGIN) || site === 'cross-site') throw accessError('Cross-site requests are not allowed.');
  if (!request.headers.has('authorization') && token) {
    const actual = Buffer.from(request.headers.get('x-karaoke-csrf') || ''), expected = Buffer.from(csrfFor(token));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw accessError('Refresh this page before retrying.');
  }
}

export function principalFor(request) {
  if (!accessEnabled()) return localPrincipal;
  const token = requestToken(request), principal = accessStore.authenticate(token);
  if (!principal) throw accessError('Pair this device or open a room invitation to continue.', 401);
  if (['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))) throw accessError('Cross-origin API requests are not allowed.');
  checkMutation(request, token);
  return principal;
}

export function requireRole(principal, roles) {
  if (!roles.includes(principal.role)) throw accessError('This action requires a paired host device.');
}

export function roomAccess(principal, id, permission = 'read') {
  if (!accessEnabled()) return { host: true };
  return accessStore.room(principal, String(id || '').toUpperCase(), permission);
}

export function limitAccess(key, maxRequests, windowMs = 60000) {
  if (!checkRateLimit(key, { maxRequests, windowMs }).allowed) throw accessError('Too many requests. Please try again later.', 429);
}

if (!global.karaokeAccessStreams) global.karaokeAccessStreams = new Map();
export function streamLease(request, principal, roomId) {
  const streams = global.karaokeAccessStreams;
  const count = streams.get(principal.id) || 0;
  if (accessEnabled() && count >= 4) throw accessError('Too many open room connections.', 429);
  streams.set(principal.id, count + 1);
  let closed = false;
  return {
    valid() {
      if (!accessEnabled()) return true;
      const current = accessStore.authenticate(requestToken(request));
      if (!current) return false;
      try { roomAccess(current, roomId); return true; } catch { return false; }
    },
    close() {
      if (closed) return;
      closed = true;
      const remaining = (streams.get(principal.id) || 1) - 1;
      if (remaining > 0) streams.set(principal.id, remaining); else streams.delete(principal.id);
    },
  };
}

/** Authorization lives with route execution, not solely in Next Proxy. */
export function withAccess(roles, handler) {
  return async request => {
    try {
      const principal = principalFor(request);
      requireRole(principal, roles);
      if (accessEnabled()) limitAccess(`api:${principal.id}`, 240);
      const response = await handler(request, principal);
      response.headers.set('Cache-Control', 'private, no-store, no-transform');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    } catch (error) {
      if (!error.status || error.status >= 500) console.error('Access request failed:', error.status || 'internal');
      return Response.json({ error: error.status ? error.message : 'The service is temporarily unavailable.' }, {
        status: error.status || 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export function publicAccess(handler) {
  return async request => {
    try {
      const enabled = accessEnabled();
      if (enabled) {
        checkMutation(request);
        limitAccess(`access:${getClientIp(request)}`, 15);
        if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) {
          throw accessError('JSON is required.', 415);
        }
      }
      const response = await handler(request, enabled);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    } catch (error) {
      return Response.json({ error: error.status ? error.message : 'Access is temporarily unavailable.' }, {
        status: error.status || 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}
