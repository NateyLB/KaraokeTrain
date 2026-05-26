/**
 * Input validation utilities to prevent injection and traversal attacks.
 */

/** YouTube video IDs are exactly 11 characters: alphanumeric, hyphens, underscores */
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/** UUIDs (v4) used for jobIds */
const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Party IDs are 4-character uppercase alphanumeric */
const PARTY_ID_REGEX = /^[A-Z0-9]{4}$/;

/** Valid stem names */
const VALID_STEMS = new Set(['vocals', 'no_vocals', 'bass', 'drums', 'other']);

export function isValidVideoId(id) {
  return typeof id === 'string' && VIDEO_ID_REGEX.test(id);
}

export function isValidJobId(id) {
  // Allow both legacy UUIDs and new Video IDs as job IDs
  return typeof id === 'string' && (UUID_REGEX.test(id) || VIDEO_ID_REGEX.test(id));
}

export function isValidPartyId(id) {
  return typeof id === 'string' && PARTY_ID_REGEX.test(id.toUpperCase());
}

export function isValidStem(stem) {
  return typeof stem === 'string' && VALID_STEMS.has(stem);
}

/**
 * Sanitize a string for safe logging (strip control characters, truncate).
 */
export function sanitizeForLog(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x1f\x7f]/g, '').slice(0, maxLen);
}
