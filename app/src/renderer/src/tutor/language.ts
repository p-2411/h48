/** True when a turn contains Japanese script and benefits from an optional English reveal. */
export function containsJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/u.test(text)
}

/** Give the learner thinking time before Duet offers help in English. */
export const ENGLISH_HELP_DELAY_MS = 8_000

/** Gives GPT-Live room to answer naturally before Duet nudges a stalled turn back into motion. */
export const LIVE_REPLY_FALLBACK_MS = 1_800
