// What went wrong, in words for the learner. The main process answers some failures with a short
// code (the voice and text tutor's tools, card previews); those read as plain sentences here, and
// any other error keeps its own message.
const SAID: Record<string, string> = {
  ACTION_EXPIRED: 'That preview expired. Ask Duet again.',
  ACTION_NOT_FOUND: 'That was already done, or has expired.',
  NO_ACTION_TO_UNDO: 'There is nothing to undo.',
  CARD_NOT_FOUND: 'That card no longer exists.',
  CARD_NOT_DUE: 'That card is not due for review yet.',
  NEW_CARD_LIMIT_REACHED: "You've reached today's limit of new cards.",
  SIBLING_CARD_DEFERRED: 'A card from the same line was just reviewed. Try this one later.',
  CARD_CANNOT_BE_UNDONE: 'That card has been reviewed since, so it can no longer be undone.',
  STALE_CARD_REVISION: 'That card changed in the meantime. Try again.',
  STALE_UNDO: 'That review can no longer be undone.',
  MOMENT_NOT_FOUND: 'Open Explain on a line first.',
  UNTRUSTED_TUTOR_CALLER: 'Open Explain on a line first.',
  INVALID_SDP_OFFER: 'Voice could not connect. Try again.'
}

/** The error as a sentence for the learner; `fallback` when it carries no message at all. */
export function say(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!message) return fallback
  return SAID[message] ?? (/^[A-Z_]+$/.test(message) ? fallback : message)
}
