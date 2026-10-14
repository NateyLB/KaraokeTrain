import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidQueueIndex } from '../lib/http/validators.js';

test('queue positions reject coercible, fractional, and out-of-range input', () => {
  for (const value of [-1, 0.5, 2, NaN, Infinity, '0', null, undefined]) {
    assert.equal(isValidQueueIndex(value, 2), false, String(value));
  }
  assert.equal(isValidQueueIndex(0, 0), false);
  assert.equal(isValidQueueIndex(0, 2), true);
  assert.equal(isValidQueueIndex(1, 2), true);
});
