// Types shared by the main process and the overlay.

/** A language Duet teaches; the list, and all it knows about each, is in shared/languages. */
export type { Language } from './languages'
import type { Language } from './languages'

/** Video sites Duet supports; each is one file in src/main/sources. */
export type Site = 'youtube' | 'netflix' | 'disneyplus' | 'crunchyroll'

/** Each site's name as the learner knows it, in the order Duet lists them. */
export const SITE_NAMES: Record<Site, string> = {
  youtube: 'YouTube',
  netflix: 'Netflix',
  disneyplus: 'Disney+',
  crunchyroll: 'Crunchyroll'
}

/** "YouTube, Netflix, Disney+ or Crunchyroll" (with `and` instead, if asked). */
export function siteList(join: 'or' | 'and' = 'or'): string {
  const names = Object.values(SITE_NAMES)
  return `${names.slice(0, -1).join(', ')} ${join} ${names.at(-1)}`
}

/** A word's job in its sentence: it chooses which words a level swaps in, and names and grammar
 * words start ignored on the knowledge ladder (the colour is the word's rung). */
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
  /** How the words are read, in Latin letters, for a language not written in them ("eiga" for 映画). */
  reading?: string
  /** The words' dictionary form, the word the learner learns ("ir" for "fue"; shared/knowledge.ts). */
  base?: string
}

export type ProcessedLine = {
  /** A natural English translation of the whole line, read in context. */
  translation: string
  /** The original line, split into words in order. Written out, it reproduces the line exactly. */
  source: Token[]
  /** The translation, split into words in order. */
  english: Token[]
}

/** How much of the language each line swaps in: 1 (a few things) to 5 (the whole line), or 0, Auto:
 * the words of level 1 and every word the learner knows (src/shared/levels.ts). */
export type Level = 0 | 1 | 2 | 3 | 4 | 5

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
export type PanelTab = 'script' | 'explain'

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
  /** The browser's app id (macOS bundle id; on Windows its process id), for listening to its sound. */
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

/** How the strip writes words of a language not written in Latin letters: in its own script, or
 * as they are read, in Latin letters (Japanese 映画 or "eiga"). */
export type WordScript = 'native' | 'reading'

/** Which of Duet's global keys: show or hide the strip, or talk to Duet. */
export type ShortcutKind = 'show' | 'talk'

export type OverlaySettings = {
  language: Language
  level: Level
  guessFirst: boolean
  /** Pause the video while the line on screen is still being translated. */
  waitForTranslation: boolean
  /** Pause the video while Explain is open (on by default, so the line stays put while it is talked about). */
  pauseForHelp: boolean
  /** The first-run screens have been seen. */
  onboarded: boolean
  /** The keys that show and hide Duet anywhere, as an Electron accelerator ("Alt+Shift+D"). */
  shortcut: string
  /** The keys that start talking to Duet about the line on screen ("Alt+Shift+T"). */
  talkShortcut: string
  /** For Japanese and Korean: the words swapped into a line in their own script, or read in Latin letters. */
  wordScript: WordScript
  /** The whole line in the language being learnt shows under the mixed line when the strip is
   * hovered (off: only the mixed line and the English). */
  showFullLine: boolean
  /** Where the learner dragged the subtitles to (the overlay window's top-left at full height: near
   * the top of the screen the window is cut shorter, see windows/overlay-size.ts), if anywhere. */
  overlayPosition?: { x: number; y: number }
  /** Where the side panel was last left, and its size. */
  panelBounds?: { x: number; y: number; width: number; height: number }
  /** Checkpoints while watching (a glow on the strip at a pause or a break). Unset until chosen:
   * Duet turns them on after the third video watched (see src/main/checkpoints). */
  checkpoints?: boolean
  /** The daily reminder's time ("19:30", local); none means no reminder. */
  reminder?: string
  /** Send crash reports and a few anonymous usage events (src/main/reports). On unless turned off. */
  shareDiagnostics: boolean
  /** Which defaults saved settings have been brought up to (see SETTINGS_VERSION in main/settings.ts). */
  version?: number
}

/** Settings before the learner changes any: Spanish, at Auto (a few words, and every word known). */
export const DEFAULT_SETTINGS: OverlaySettings = {
  language: 'es',
  level: 0,
  guessFirst: true,
  waitForTranslation: true,
  pauseForHelp: true,
  onboarded: false,
  shortcut: 'Alt+Shift+D',
  talkShortcut: 'Alt+Shift+T',
  wordScript: 'native',
  showFullLine: true,
  shareDiagnostics: true,
  version: 2
}

/** Whether Duet may hear the browser's sound (macOS System Audio Recording); 'unavailable' when
 * this computer has no audio reader. */
export type AudioPermission = 'granted' | 'denied' | 'not-asked' | 'unknown' | 'unavailable'

/** Cards ready to review now: due ones, and new ones still allowed today. */
export type DueCounts = { due: number; newAvailable: number }

/** The cards that can be reviewed now: those due, plus new ones still allowed today. */
export const reviewableNow = ({ due, newAvailable }: DueCounts): number => due + newAvailable
