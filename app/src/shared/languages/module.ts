// What Duet knows about a language it teaches. Each language is a folder here (es/, ja/, ko/) whose
// index.ts fills in this shape, beside its word-frequency list and, when it needs one, its dictionary
// builder. The rest of the app reads languages only through this shape, and the registry is made
// from the folders (scripts/languages.mjs), so adding a language changes no other file. README.md
// says what a folder holds.
import type { Source } from '../sources'
import type { ProcessedLine, Token, WordJob } from '../types'

/** How to tell a piece of text is in the language. */
export type Recognition =
  /** Written in its own script: the share of letters in `letters` (plus `alsoCounts`, letters it
   * shares with another language, such as Japanese kanji) that makes a line this language. */
  | { kind: 'script'; letters: RegExp; alsoCounts?: RegExp; share: number }
  /** Written in Latin letters: its commonest words, and marks that point to it (each match adds
   * `weight`), weighed against the other Latin-script languages in detect.ts. */
  | { kind: 'words'; words: string[]; marks: { pattern: RegExp; weight: number }[] }

/** A placement-test word: the word, how it's read (when its script isn't Latin), its meaning and
 * three wrong ones. */
export type WelcomeItem = { word: string; read?: string; en: string; wrong: [string, string, string] }

/** What the first run (renderer/src/welcome) says and asks in the language. */
export type Welcome = {
  /** Its name in itself ("Español"). */
  own: string
  /** The clip on the stage (renderer/public/video/welcome, by name): a few seconds of stock
   * footage, silent; and what its label calls the scene. */
  video: string
  scene: string
  /** Duet's hello when it's picked, and its English. */
  hello: string
  helloEn: string
  /** Two words in each frequency band, commonest first (the first 500 words, to 2,000, to 5,000,
   * past 5,000). */
  bands: [WelcomeItem[], WelcomeItem[], WelcomeItem[], WelcomeItem[]]
  /** A whole line for anyone placed high, meaning "Leave the keys on the table; I'll be back
   * tomorrow." (its three English choices are the same for every language). */
  full: string
  /** "Perfect!" */
  perfect: string
}

/** The kinds of moment the mascot reacts to (renderer/src/components/duet/conversation.ts), each
 * found by phrases in English and in every language that lists some. */
export type MascotCue =
  | 'oops'
  | 'almost'
  | 'sad'
  | 'encourage'
  | 'amazed'
  | 'proud'
  | 'correct'
  | 'confused'
  | 'shy'
  | 'thanks'
  | 'laughing'
  | 'surprised'
  | 'determined'
  | 'hello'
  | 'joke'
  | 'giggle'
  | 'understood'
  | 'agree'
  | 'disagree'
  | 'curious'
  /** A translation or "say after me" exercise: the words in it aren't feelings, so no reaction. */
  | 'exercise'

/** The language's everyday phrases for each cue, as patterns (matched ignoring case, anywhere in a
 * clause unless anchored with ^); and words that, just before a phrase, negate it ("nunca"). */
export type MascotPhrases = Partial<Record<MascotCue, RegExp>> & { negations?: string[] }

export interface LanguageModule {
  /** Its name in English ("Spanish"). */
  name: string
  recognise: Recognition
  /** How to write it in Latin letters for an English speaker; undefined when it already is. */
  reading?: { name: string; instructions: string }
  /** Whether a dictionary headword is shown split into syllables ("ma·dru·gar"); not for a script
   * whose characters already are the syllables (kana, hangul). */
  syllables: boolean
  /** "My sister bought a new car." in the language, word by word, for the welcome window. */
  sample: ProcessedLine
  /** Extra guidance for splitting its lines into phrases (ai/lines/prompt.ts); may be empty. */
  phrasing: string
  /** The language's own parts of the voice tutor's prompts (tutor/prompts.ts). */
  tutor: {
    /** How Duet should sound speaking it. */
    speech: string[]
    /** What learners of it most often get wrong, so corrections look there first. */
    corrections: string[]
    /** How the learner's delivery can mislead a native listener (intonation, stress, tone), for voice,
     * which hears the learner. */
    delivery: string[]
  }
  /** How Duet's voice says it: the language tag ("es-ES"), and its name as the recording script
   * (scripts/record-welcome-voice.mjs) asks for it ("Spanish (Spain)"). */
  voice: { tag: string; name: string }
  /** The fonts its script is shown in, best first (without the fallback), when the default font
   * lacks it. */
  font?: string
  /** Reading levels (shared/progress.ts): whether a form its frequency list lacks may be ranked by
   * listed parts, for a language written without spaces or whose words carry particles and endings
   * (大人になる is 大人 + に + なる; 친구를 is 친구 + 를). */
  rankByParts: boolean
  /** Other forms its frequency list may give a word in, besides its dictionary form and the form
   * seen: Korean's list keeps verb stems (먹 for 먹다). */
  listForms?: (form: string, job: WordJob | undefined) => string[]
  /** The article a noun of this gender takes ("feminine" → "la"), for a language whose nouns have
   * one. */
  article?: (gender: string) => string | undefined
  /** Card backs from Wiktionary (main/dictionary/wiktionary.ts): the letters a related word or an
   * example must be written in (so a gloss or a note isn't taken for one), and the longest example
   * kept, in characters (longer ones are passages, not everyday lines). */
  dictionary: { letters: RegExp; exampleLength: number }
  /** What the first run says and asks in it. */
  welcome: Welcome
  /** Its everyday phrases for the mascot's reactions; optional (without them the mascot still reacts
   * to English and to punctuation). */
  mascot?: MascotPhrases
  /** Open data only this language uses (a dictionary of its own), credited in Settings → Sources. */
  sources?: Source[]
}

/** A token, for writing samples briefly. */
export const token = (text: string, job: WordJob, pair: number | null, space = true): Token => ({ text, job, pair, space })

/** "My sister bought a new car." in English; `my` pairs "My" with a word when the language has one. */
export function sampleEnglish(my: number | null): Token[] {
  return [
    token('My', 'p', my),
    token('sister', 'n', 2),
    token('bought', 'v', 3),
    token('a', 'g', 4),
    token('new', 'a', 6),
    token('car', 'n', 5, false),
    token('.', 'g', null)
  ]
}
