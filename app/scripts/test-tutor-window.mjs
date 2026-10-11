// Checks the tutor window's pure timing rules. Run with: npx jiti scripts/test-tutor-window.mjs
import assert from 'node:assert/strict'
import {
  HEALTHY_SESSION_MS,
  nextReconnectAttempt,
  RECONNECT_LIMIT
} from '../src/renderer/src/tutor/reconnect.ts'
import { TURN_SETTLE_MS } from '../src/renderer/src/tutor/timing.ts'

const now = 1_000_000

// useLiveTutor shows "Reconnecting (n/3)" as literal text, which smoke-tutor.mjs checks.
assert.equal(RECONNECT_LIMIT, 3, 'reconnect limit shown to the learner')

// Sessions that start and drop again at once keep counting, so the limit is reached.
let attempts = 0
for (let drop = 1; drop <= RECONNECT_LIMIT + 1; drop++) {
  attempts = nextReconnectAttempt(attempts, now - 2_000, now)
  assert.equal(attempts, drop, `quick drop ${drop}`)
}
assert.ok(attempts > RECONNECT_LIMIT, 'Quick drops never reached the reconnect limit.')

// A session that never said it started keeps counting too.
assert.equal(nextReconnectAttempt(2, undefined, now), 3, 'drop before session.started')

// A drop after a healthy stretch starts a fresh count.
assert.equal(
  nextReconnectAttempt(3, now - HEALTHY_SESSION_MS, now),
  1,
  'drop after a healthy session'
)
assert.equal(
  nextReconnectAttempt(3, now - HEALTHY_SESSION_MS + 1, now),
  4,
  'drop just before healthy'
)

// Pronunciation and late meanings wait longer than the 1 s gap that still joins words to a turn.
assert.ok(TURN_SETTLE_MS > 1_000, 'TURN_SETTLE_MS must exceed the 1 s turn merge window.')

console.log('Tutor window checks passed.')
