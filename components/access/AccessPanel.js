'use client';
import { useState } from 'react';
import { apiFetch } from '../../lib/access/client';

export default function AccessPanel({ session, pathname }) {
  const [open, setOpen] = useState(false), [grant, setGrant] = useState(null), [devices, setDevices] = useState([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const roomId = pathname.match(/^\/(?:room|remote)\/([A-Z0-9]{4})$/)?.[1];
  async function action(body) {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/access/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.url) setGrant(data);
      if (body.action === 'revoke') setDevices(previous => previous.filter(device => device.id !== body.deviceId));
      if (body.action === 'revokeGuests') setGrant(null);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function listDevices() {
    try {
      const response = await apiFetch('/api/access/manage');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDevices(data.devices);
    } catch (failure) { setError(failure.message); }
  }
  if (session.role === 'guest') return <p style={{ position: 'fixed', bottom: 8, left: 12, fontSize: '.8rem' }}>Guest access • {session.rooms?.join(', ')}</p>;
  return <>
    <button onClick={() => setOpen(true)} className="glass-panel" style={{ position: 'fixed', bottom: 12, left: 12, padding: '.75rem', zIndex: 55 }}>Devices & invitations</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Devices and invitations" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#05001af2', overflow: 'auto', padding: '2rem' }}>
      <div style={{ maxWidth: 480, margin: 'auto', display: 'grid', gap: '1rem' }}>
        <h2>Devices & invitations</h2>
        {roomId && <button disabled={busy} onClick={() => action({ action: 'invite', roomId })}>Create guest invitation</button>}
        {roomId && <button disabled={busy} onClick={() => action({ action: 'revokeGuests', roomId })}>Remove guest access to this room</button>}
        {session.role === 'owner' && <>
          <button disabled={busy} onClick={() => action({ action: 'pair', name: 'Paired device' })}>Pair a host device</button>
          <button onClick={listDevices}>Manage devices</button>
          {devices.map(device => <div key={device.id}>{device.name} · {device.role} <button disabled={busy} onClick={() => action({ action: 'revoke', deviceId: device.id })}>Revoke</button></div>)}
        </>}
        {grant && <>
          {/* QR content is produced locally; no third-party image service receives the secret. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grant.qr} width={280} height={280} alt="Scan this invitation QR code" />
          <p>Expires {new Date(grant.expiresAt).toLocaleTimeString()}.</p>
          <input aria-label="Invitation link" value={grant.url} readOnly onFocus={event => event.target.select()} />
          <button onClick={() => navigator.clipboard.writeText(grant.url).catch(() => setError('Select and copy the link above.'))}>Copy link</button>
        </>}
        {error && <p role="alert">{error}</p>}
        <button onClick={() => { setOpen(false); setGrant(null); }}>Close</button>
      </div>
    </div>}
  </>;
}
