
/** Give the learner thinking time before Duet offers help in English. */
export const ENGLISH_HELP_DELAY_MS = 8_000

/** Gives GPT-Live room to answer naturally before Duet nudges a stalled turn back into motion. */
export const LIVE_REPLY_FALLBACK_MS = 1_800

/**
 * Wait this long after a turn's last words before asking for its romanisation or a fuller
 * meaning. Longer than the 1 s gap that still joins new words onto the same turn.
 */
export const TURN_SETTLE_MS = 1_200
