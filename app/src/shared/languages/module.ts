// What Duet knows about a language it teaches. Each language is one file in this folder that
// fills in this shape; the rest of the app reads languages only through it (see index.ts), so
// adding one is a new file and a line in the registry.
import type { ProcessedLine, Token, WordJob } from '../types'

/** How to tell a piece of text is in the language. */
export type Recognition =
  /** Written in its own script: the share of letters in `letters` (plus `alsoCounts`, letters it
   * shares with another language, such as Japanese kanji) that makes a line this language. */
  | { kind: 'script'; letters: RegExp; alsoCounts?: RegExp; share: number }
  /** Written in Latin letters: its commonest words, and marks that point to it (each match adds
   * `weight`), weighed against the other Latin-script languages in detect.ts. */
  | { kind: 'words'; words: string[]; marks: { pattern: RegExp; weight: number }[] }

export interface LanguageModule {
  /** Its name in English ("Spanish"). */
  name: string
  recognise: Recognition
  /** How to write it in Latin letters for an English speaker; undefined when it already is. */
  reading?: { name: string; instructions: string }
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
  }
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
