'use client';
import { useEffect, useRef, useState } from 'react';
import { resetAccessSession } from '../../lib/access/client';

export default function DeviceRedeem({ invite = false }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token && input.current) input.current.value = token;
    // Keep invitation secrets out of navigation, referrers and browser history.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  async function redeem(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let token = input.current.value.trim();
      if (token.includes('://')) token = new URLSearchParams(new URL(token).hash.slice(1)).get('token') || '';
      const response = await fetch('/api/access/redeem', { method: 'POST', credentials: 'same-origin',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: 'Web browser', client: 'web' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This link could not be opened.');
      resetAccessSession();
      window.location.replace(data.roomId ? `/remote/${encodeURIComponent(data.roomId)}` : '/');
    } catch (failure) { setError(failure.message); setBusy(false); }
  }
  return <section className="glass-panel" style={{ maxWidth: 460, margin: '12vh auto', padding: '2rem' }}>
    <h1 className="heading-2">{invite ? 'Join this party' : 'Pair this device'}</h1>
    <p style={{ margin: '1rem 0' }}>{invite ? 'Your invitation lets you see the room and add songs for two hours.' : 'Open the pairing link from your Mac or paste it below. No account is needed.'}</p>
    <form onSubmit={redeem} style={{ display: 'grid', gap: '1rem' }}>
      <label>Invitation or pairing link<input ref={input} aria-label="Invitation or pairing link" type="password"
        autoComplete="off" required style={{ width: '100%', padding: '.75rem' }} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Connecting…' : invite ? 'Join party' : 'Pair device'}</button>
    </form>
  </section>;
}
