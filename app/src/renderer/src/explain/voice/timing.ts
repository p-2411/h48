
/** Give the learner thinking time before Duet offers help in English. */
export const ENGLISH_HELP_DELAY_MS = 8_000

/** Gives GPT-Live room to answer naturally before Duet nudges a stalled turn back into motion. */
export const LIVE_REPLY_FALLBACK_MS = 1_800

/**
 * Wait this long after a turn's last words before asking for its romanisation or a fuller
 * meaning. Longer than the 1 s gap that still joins new words onto the same turn.
 */
export const TURN_SETTLE_MS = 1_200

/**
 * Voice is billed for every minute it is open, so a minute with nobody speaking (the learner muted,
 * or gone back to the show) ends it, quietly, as End does. Long enough for a pause to think.
 */
export const SILENT_END_MS = 60_000

/** Whether no one has spoken for long enough that voice should end; `lastSpeech` is when someone last did. */
export function silentTooLong(lastSpeech: number, now: number): boolean {
  return now - lastSpeech >= SILENT_END_MS
}

/** How often an open session checks whether it has gone silent for too long. */
export const SILENCE_CHECK_MS = 5_000

/**
 * How often a connected call tells main it is still connected. Duet's server keeps a call going only
 * while it hears about it (it hangs up after 90 s), so this is well inside that.
 */
export const ALIVE_EVERY_MS = 20_000
