import QRCode from 'qrcode';
import { accessEnabled, accessStore, withAccess, roomAccess, limitAccess } from '../../../../lib/access/server.js';
import { readJsonObject } from '../../../../lib/http/requestBody.js';
import { accessError } from '../../../../lib/access/AccessStore.js';

export const GET = withAccess(['owner'], async () => Response.json({ devices: accessStore.devices() }));

export const POST = withAccess(['owner', 'host'], async (request, principal) => {
  if (!accessEnabled()) throw accessError('Use the secure server to manage pairing.', 400);
  const body = await readJsonObject(request, 4096);
  limitAccess(`grant:${principal.id}`, 10);
  let grant, pathname;
  if (body.action === 'invite') {
    const roomId = String(body.roomId || '').toUpperCase();
    roomAccess(principal, roomId, 'control');
    grant = accessStore.invitation(principal, roomId);
    pathname = '/invite';
  } else if (body.action === 'pair' && principal.role === 'owner') {
    grant = accessStore.pairing(body.name, 'host', principal.id);
    pathname = '/pair';
  } else if (body.action === 'revoke' && principal.role === 'owner' && typeof body.deviceId === 'string') {
    accessStore.revoke(body.deviceId);
    return Response.json({ revoked: true });
  } else if (body.action === 'revokeGuests') {
    accessStore.revokeGuests(principal, String(body.roomId || '').toUpperCase());
    return Response.json({ revoked: true });
  } else throw accessError('This action is not permitted.');
  const url = `${process.env.PUBLIC_ORIGIN}${pathname}#token=${grant.token}`;
  const qr = await QRCode.toDataURL(url, { width: 320, margin: 3, errorCorrectionLevel: 'M' });
  return Response.json({ url, qr, expiresAt: grant.expiresAt, roomId: grant.roomId });
});
