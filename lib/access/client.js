let sessionPromise;

export function resetAccessSession() { sessionPromise = undefined; }

export async function accessSession() {
  if (!sessionPromise) sessionPromise = fetch('/api/access/session', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(15000) })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) { sessionPromise = undefined; return { enabled: true, paired: false, error: data.error }; }
      return data;
    }).catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}

/** Same-origin cookies for reads/media; session-bound CSRF on every mutation. */
export async function apiFetch(url, options = {}) {
  if (typeof url !== 'string' || !url.startsWith('/api/')) throw new TypeError('API requests must use a same-origin API path.');
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) {
    const session = await accessSession();
    if (session.csrf) headers.set('X-Karaoke-CSRF', session.csrf);
  }
  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}
