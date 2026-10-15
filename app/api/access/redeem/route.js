import { accessStore, COOKIE, publicAccess, requestToken } from '../../../../lib/access/server.js';
import { readJsonObject } from '../../../../lib/http/requestBody.js';
import { csrfFor } from '../../../../lib/access/AccessStore.js';

export const POST = publicAccess(async (request, enabled) => {
  if (!enabled) return Response.json({ error: 'Pairing is only needed on the secure server.' }, { status: 400 });
  const body = await readJsonObject(request, 4096);
  const { token, principal, roomId } = accessStore.redeem(body.token, body.name, requestToken(request));
  const maxAge = Math.max(0, Math.floor((principal.expiresAt - Date.now()) / 1000));
  return Response.json({ paired: true, role: principal.role, roomId, csrf: csrfFor(token),
    ...(body.client === 'native' ? { deviceToken: token, expiresAt: principal.expiresAt } : {}) }, {
    headers: { 'Set-Cookie': `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` },
  });
});
