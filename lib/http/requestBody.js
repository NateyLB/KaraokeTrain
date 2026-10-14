export class RequestBodyError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** Route handlers have no implicit JSON size cap. Enforce it while streaming. */
export async function readJsonObject(request, maxBytes = 65536) {
  if (!request.body) throw new RequestBodyError('A JSON object is required');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError('Request body is too large', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestBodyError('Valid JSON is required'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('A JSON object is required');
  return body;
}
