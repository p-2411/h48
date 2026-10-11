// Types shared by the main process and the overlay.

export type Language = 'es' | 'ja' | 'ko'

export const LANGUAGES: Record<Language, string> = { es: 'Spanish', ja: 'Japanese', ko: 'Korean' }

/** A word's job in its sentence; each has its own colour. */
export type WordJob =
  | 'n' // things (nouns)
  | 'v' // actions (verbs)
  | 'a' // describing words
  | 'p' // people and pointers (pronouns, question words)
  | 'x' // names
  | 'g' // glue (articles, particles, prepositions, conjunctions)

export type Token = {
  text: string
  job: WordJob
  /** Tokens in the original and the English that mean the same thing share a pair number. */
  pair: number | null
  /** Whether a space follows this token when the line is written out. */
  space: boolean
}

export type ProcessedLine = {
  /** A natural English translation of the whole line, read in context. */
  translation: string
  /** The original line, split into words in order. Written out, it reproduces the line exactly. */
  source: Token[]
  /** The translation, split into words in order. */
  english: Token[]
}

/** How far into the target language the mixed line goes: 1 swaps only things, 5 is the full line. */
export type Level = 1 | 2 | 3 | 4 | 5

/** One caption line as the overlay sees it. */
export type OverlayLine = {
  id: number
  original: string
  at: number
  /** When the line is spoken, in seconds into the video; only lines from a transcript have it. */
  start?: number
  end?: number
  state: 'pending' | 'ready' | 'failed'
  processed?: ProcessedLine
  error?: string
}

export type OverlayStatus = {
  /** The caption reader is running with the permission it needs. */
  trusted: boolean
  browser?: string
  url?: string
  captions?: boolean
  /** Where lines come from: the video's transcript, or the captions on screen. */
  source?: 'transcript' | 'captions'
  /** False when the player says this video has no captions at all. */
  available?: boolean
  error?: string
  /** Which AI model processes lines, e.g. "anthropic/claude-opus-5-5". */
  model?: string
  modelError?: string
}

export type OverlaySettings = {
  language: Language
  level: Level
  guessFirst: boolean
  /** Pause the video while the line on screen is still being translated. */
  waitForTranslation: boolean
}
