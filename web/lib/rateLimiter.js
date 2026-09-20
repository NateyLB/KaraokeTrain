/**
 * Simple in-memory rate limiter.
 * Tracks request counts per IP within a sliding window.
 */

const rateLimitStore = new Map();

/**
 * Extract the real client IP from the request.
 * Uses the LAST IP in x-forwarded-for (the one appended by Cloud Run/the reverse proxy),
 * which cannot be spoofed by the client. The FIRST IP is client-controlled and trivially forgeable.
 */
export function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const ips = xff.split(',').map(ip => ip.trim());
    // Use the last IP — the one added by the infrastructure, not the client
    return ips[ips.length - 1] || 'unknown';
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

const CLEANUP_INTERVAL = 60 * 1000; // Clean up old entries every 60 seconds

// Periodically purge expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > entry.windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Check if a request should be rate limited.
 * @param {string} identifier - Unique identifier (e.g., IP address)
 * @param {object} options - Rate limit options
 * @param {number} options.maxRequests - Maximum requests allowed in the window
 * @param {number} options.windowMs - Time window in milliseconds
 * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
 */
export function checkRateLimit(identifier, { maxRequests = 30, windowMs = 60000 } = {}) {
  const now = Date.now();
  const key = identifier;

  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    // Start a new window
    entry = { count: 1, windowStart: now, windowMs };
    rateLimitStore.set(key, entry);
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const resetMs = windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetMs };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetMs: windowMs - (now - entry.windowStart) };
}

/**
 * Track concurrent jobs to prevent resource exhaustion.
 */
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 3;

export function canStartJob() {
  return activeJobs < MAX_CONCURRENT_JOBS;
}

export function startJob() {
  activeJobs++;
}

export function finishJob() {
  activeJobs = Math.max(0, activeJobs - 1);
}
