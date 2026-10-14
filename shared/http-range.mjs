// A single byte range for AVPlayer/PyAV and browser media requests.
// null = full response; false = malformed or unsatisfiable.
export function parseByteRange(header, size) {
  if (header == null) return null;
  if (!Number.isSafeInteger(size) || size <= 0 || typeof header !== 'string') return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : false;
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || start > requestedEnd) return false;
  return { start, end: Math.min(requestedEnd, size - 1) };
}
