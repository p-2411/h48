// How many times Duet quietly restores a dropped voice session before it asks the learner.

/** Automatic reconnects allowed in a row before Duet asks the learner to press Reconnect. */
export const RECONNECT_LIMIT = 3

/** A session that stays up this long counts as healthy, so its next drop starts a fresh count. */
export const HEALTHY_SESSION_MS = 30_000

/**
 * The number of this reconnect attempt. Sessions that start and drop again at once keep counting
 * up to the limit; a drop after a healthy stretch starts again at 1.
 */
export function nextReconnectAttempt(
  previous: number,
  healthySince: number | undefined,
  now: number
): number {
  if (healthySince !== undefined && now - healthySince >= HEALTHY_SESSION_MS) return 1
  return previous + 1
}
