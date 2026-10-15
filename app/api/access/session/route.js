import { accessEnabled, accessStore, COOKIE, publicAccess, requestToken, withAccess } from '../../../../lib/access/server.js';
import { csrfFor } from '../../../../lib/access/AccessStore.js';

export const GET = publicAccess(async (request, enabled) => {
  if (!enabled) return Response.json({ enabled: false, role: 'owner' });
  const token = requestToken(request), principal = accessStore.authenticate(token);
  if (!principal) return Response.json({ enabled: true, paired: false }, { status: 401 });
  return Response.json({ enabled: true, paired: true, id: principal.id, name: principal.name,
    role: principal.role, rooms: Object.keys(principal.rooms), csrf: csrfFor(token), expiresAt: principal.expiresAt });
});

export const DELETE = withAccess(['owner', 'host', 'guest'], async (_request, principal) => {
  if (accessEnabled()) accessStore.revoke(principal.id);
  return Response.json({ paired: false }, {
  headers: { 'Set-Cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0` },
  });
});
