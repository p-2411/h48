// What the daily session's page is shown (src/main/daily keeps the rest, answers included).

/** A line to say back. */
export type SayView = { original: string; translation: string }

/** A word to recall: the line with it blanked, and three to choose from (no answer). */
export type RecallView = {
  kind: 'recall'
  before: string
  after: string
  spaceBefore: boolean
  spaceAfter: boolean
  choices: string[]
  /** The line's English, as a hint. */
  translation: string
}

/** What did they mean: the line asked about. */
export type MeaningView = { kind: 'meaning'; original: string }

/** Use it: the line just said back, its English, and its words, for a sentence of the learner's own
 * that could come next. */
export type ProduceView = { kind: 'produce'; original: string; translation: string; words: string[] }

export type SessionView = {
  /** Due cards to review first (capped to about 5 minutes). */
  cards: number
  /** The video the line and the challenge come from. */
  video?: string
  /** The line to say back. */
  say?: SayView
  challenge?: RecallView | MeaningView | ProduceView
}

export type SessionAudio = { data: Uint8Array; mimeType: string }

/** The learner's try at saying a line: what Duet heard (empty when it heard no speech), a short,
 * encouraging note, and whether it was good: every word clear enough for a native speaker. */
export type LineAttempt = { heard: string; note: string; good: boolean }

/** The word picked in a recall: right or not, the answer, and whether a missed word is in the cards now. */
export type RecallResult = { correct: boolean; answer: string; carded: boolean }

/** A challenge's steps, the same for the daily session and checkpoints (src/main/challenges/ipc.ts). */
export type ChallengeApi = {
  speak(): Promise<SessionAudio>
  /** The learner's recording (WAV) of the line said back. */
  coach(clip: SessionAudio): Promise<LineAttempt>
  checkRecall(choice: string): Promise<RecallResult>
  meaningQuestion(): Promise<{ question: string }>
  meaningCheck(answer: string): Promise<{ note: string }>
  /** The learner's own sentence: a note on it, and the line's words used well in it. */
  produceCheck(sentence: string): Promise<{ note: string; used: string[] }>
}
