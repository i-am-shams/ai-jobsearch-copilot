import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMatchCompletedEvent } from './events.js';

test('accepts a well-formed Completed event', () => {
  assert.equal(
    isMatchCompletedEvent({
      ApplicationId: '11111111-1111-1111-1111-111111111111',
      UserId: '22222222-2222-2222-2222-222222222222',
      Status: 'Completed',
      MatchScore: 90,
      GapAnalysis: 'text',
      CompletedAt: '2026-01-01T00:00:00Z',
    }),
    true,
  );
});

test('accepts a well-formed Failed event with null score/analysis', () => {
  assert.equal(
    isMatchCompletedEvent({
      ApplicationId: '11111111-1111-1111-1111-111111111111',
      UserId: '22222222-2222-2222-2222-222222222222',
      Status: 'Failed',
      MatchScore: null,
      GapAnalysis: null,
      CompletedAt: '2026-01-01T00:00:00Z',
    }),
    true,
  );
});

// The whole point of this guard is refusing to silently accept a payload
// that isn't actually this event - e.g. a camelCase body, which is exactly
// what would show up if the worker's serialization ever changed.
test('rejects a camelCase payload (wrong casing is not this event)', () => {
  assert.equal(
    isMatchCompletedEvent({
      applicationId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      status: 'Completed',
    }),
    false,
  );
});

test('rejects an unrecognized Status value', () => {
  assert.equal(
    isMatchCompletedEvent({
      ApplicationId: '11111111-1111-1111-1111-111111111111',
      UserId: '22222222-2222-2222-2222-222222222222',
      Status: 'Processing',
    }),
    false,
  );
});

test('rejects null and non-objects', () => {
  assert.equal(isMatchCompletedEvent(null), false);
  assert.equal(isMatchCompletedEvent('a string'), false);
  assert.equal(isMatchCompletedEvent(42), false);
});
