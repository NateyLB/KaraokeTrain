import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJsonObject } from '../lib/http/requestBody.js';

const request = body => new Request('http://localhost/test', { method: 'POST', body });
test('bounded request parser preserves Unicode and rejects malformed or non-object JSON', async () => {
  assert.deepEqual(await readJsonObject(request('{"title":"🎵 한글"}')), { title: '🎵 한글' });
  for (const body of ['{', 'null', '[]', '42', '"text"', '']) await assert.rejects(readJsonObject(request(body)), { status: 400 });
});
test('oversized bodies are rejected before JSON parsing', async () => {
  await assert.rejects(readJsonObject(request('{"x":"' + 'a'.repeat(200) + '"}'), 100), { status: 413 });
});
