// Types shared by the main process and the overlay.

export type Language = 'es' | 'ja' | 'ko'

/** Video sites Duet supports; each is one file in src/main/sources. */
export type Site = 'youtube' | 'netflix'

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
  /** When the line is spoken, in seconds into the video: exact for transcript lines, where the video
   * was when the caption appeared for lines read from the screen (when known). */
  start?: number
  end?: number
  state: 'pending' | 'ready' | 'failed'
  processed?: ProcessedLine
  error?: string
}

/** The side panel's tabs. */
export type PanelTab = 'script' | 'explain' | 'review'

/** Every line of the video so far (or the whole transcript), for the Script tab. */
export type Script = {
  /** transcript: the whole video, timed; captions: the lines read from the screen so far. */
  source: 'transcript' | 'captions'
  lines: OverlayLine[]
}

export type OverlayStatus = {
  /** The video is playing (as far as Duet can see), and whether Wait is holding it for a line. */
  playing?: boolean
  waiting?: boolean
  audio?: AudioPermission
  /** The caption reader is running with the permission it needs. */
  trusted: boolean
  browser?: string
  /** The browser's app id (macOS bundle id), for listening to its sound. */
  bundle?: string
  url?: string
  captions?: boolean
  /** The site of the page being read, and what Duet can do with its player. */
  site?: Site
  siteName?: string
  controls?: { playPause: boolean; seek: boolean }
  /** Where lines come from: the video's transcript, the captions on screen, or Duet's own hearing of
   * the audio (when there are neither). */
  source?: 'transcript' | 'captions' | 'audio'
  /** False when the player says this video has no captions at all. */
  available?: boolean
  /** Set when what Duet reads or hears is mostly in another language than the one being learnt
   * (those lines are then ignored): which language, or 'other' for one Duet doesn't teach, and
   * whether it came from the captions or the audio. */
  otherLanguage?: { language: Language | 'other'; from: 'captions' | 'audio' }
  /** Set when listening to the video shows it is spoken in another language than the one being
   * learnt (so its subtitles are a translation): the language, and its name as heard. */
  spokenLanguage?: { language: Language | 'other'; name: string }
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
  /** Pause the video while Explain is open (off by default: Duet never pauses the show unasked). */
  pauseForHelp: boolean
  /** The first-run screens have been seen. */
  onboarded: boolean
  /** The keys that show and hide Duet anywhere, as an Electron accelerator ("Alt+Shift+D"). */
  shortcut: string
  /** Where the learner dragged the subtitles to (the overlay window's top-left), if anywhere. */
  overlayPosition?: { x: number; y: number }
}

/** Whether Duet may hear the browser's sound (macOS System Audio Recording); 'unavailable' when
 * this computer has no audio reader. */
export type AudioPermission = 'granted' | 'denied' | 'not-asked' | 'unknown' | 'unavailable'

/** Cards ready to review now: due ones, and new ones still allowed today. */
export type DueCounts = { due: number; newAvailable: number }
