import { isValidQueueIndex } from '../http/validators.js';

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function validateIdentity(identity, nullable = false) {
  if (identity === undefined || (nullable && identity === null)) return;
  if (typeof identity !== 'string' || !identity || identity.length > 100) {
    fail('A valid queue entry identity is required', 400);
  }
}

/** Positional legacy requests remain supported; current clients also identify the rendered entry. */
export function assertQueueEntry(queue, index, expectedQueueId) {
  validateIdentity(expectedQueueId);
  if (!Number.isInteger(index) || index < 0) fail('A valid queue index is required', 400);
  if (expectedQueueId !== undefined && queue[index]?.queueId !== expectedQueueId) {
    fail('The queue changed on another device. Please try again.', 409);
  }
  if (!isValidQueueIndex(index, queue.length)) fail('A valid queue index is required', 400);
}

export function assertCurrentSong(party, expectedCurrentQueueId) {
  validateIdentity(expectedCurrentQueueId, true);
  if (expectedCurrentQueueId !== undefined && (party.currentSong?.queueId ?? null) !== expectedCurrentQueueId) {
    fail('The current song changed on another device. Please try again.', 409);
  }
}
