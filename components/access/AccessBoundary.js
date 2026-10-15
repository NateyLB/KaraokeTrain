'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { accessSession, resetAccessSession } from '../../lib/access/client';
import DeviceRedeem from './DeviceRedeem';
import AccessPanel from './AccessPanel';

const AccessContext = createContext({ enabled: false, role: 'owner' });
export const useAccess = () => useContext(AccessContext);

export default function AccessBoundary({ children }) {
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const publicPage = ['/pair', '/invite'].includes(pathname);
  useEffect(() => {
    if (publicPage) return;
    let active = true;
    accessSession().then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setError('Could not reach the server. Reload to retry.'); });
    const refresh = () => {
      resetAccessSession();
      accessSession().then(value => { if (active) setSession(value); }).catch(() => {});
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [publicPage]);
  if (publicPage) return children;
  if (error) return <p role="alert">{error}</p>;
  if (!session) return <p role="status">Connecting…</p>;
  if (session.enabled && !session.paired) return <DeviceRedeem />;
  const guestHostPage = session.role === 'guest' && pathname.startsWith('/room/');
  return <AccessContext.Provider value={session}>
    {guestHostPage ? <p>Open your room invitation to join as a guest. Hosting requires a paired host device.</p> : children}
    {session.enabled && <AccessPanel session={session} pathname={pathname} />}
  </AccessContext.Provider>;
}
