// What the daily session's page is shown (src/main/daily keeps the rest, answers included).

export type SessionView = {
  /** Due cards to review first (capped to about 5 minutes). */
  cards: number
  /** The video the line and the challenge come from. */
  video?: string
  /** The line to say back. */
  say?: { original: string; translation: string }
  challenge?:
    | {
        kind: 'recall'
        before: string
        after: string
        spaceBefore: boolean
        spaceAfter: boolean
        choices: string[]
        /** The line's English, as a hint. */
        translation: string
      }
    | { kind: 'meaning'; original: string }
}

export type SessionAudio = { data: Uint8Array; mimeType: string }

/** The learner's try at saying a line: what Duet heard, and a short, encouraging note. */
export type LineAttempt = { heard: string; note: string }
