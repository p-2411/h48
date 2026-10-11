// The languages Duet teaches. Adding one: a file beside this one that fills in LanguageModule (see
// module.ts), and a line in LANGUAGE_MODULES. Everything else (the settings, the welcome window,
// the line and tutor prompts, caption detection, the card schema) reads the list from here.
import { es } from './es'
import { ja } from './ja'
import { ko } from './ko'
import type { LanguageModule, Recognition } from './module'
import { OTHER_LATIN } from './others'

export type { LanguageModule, Recognition } from './module'

const LANGUAGE_MODULES = { es, ja, ko } satisfies Record<string, LanguageModule>

export type Language = keyof typeof LANGUAGE_MODULES

export const LANGUAGE_CODES = Object.keys(LANGUAGE_MODULES) as [Language, ...Language[]]

/** Whether `value` is a language Duet teaches (what a page may send). */
export function isLanguage(value: unknown): value is Language {
  return LANGUAGE_CODES.includes(value as Language)
}

export function languageModule(language: Language): LanguageModule {
  return LANGUAGE_MODULES[language]
}

/** The language's name in English ("Spanish"). */
export function languageName(language: Language): string {
  return LANGUAGE_MODULES[language].name
}

/** The language with this English name ("spanish", any case), if Duet teaches it. */
export function languageNamed(name: string): Language | undefined {
  return LANGUAGE_CODES.find((code) => LANGUAGE_MODULES[code].name.toLowerCase() === name.trim().toLowerCase())
}

/** How many matches of a pattern a text has. */
export function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length
}

type Words = Extract<Recognition, { kind: 'words' }>

/** How strongly a text in Latin letters points to a language that is told by its words and marks. */
export function wordScore(recognition: Words, text: string): number {
  const words = text.toLocaleLowerCase().match(/[\p{L}']+/gu) ?? []
  const common = words.filter((word) => recognition.words.includes(word)).length
  return common + recognition.marks.reduce((sum, mark) => sum + countMatches(text, mark.pattern) * mark.weight, 0)
}

/**
 * The script language most of a text is written in (its letters, plus letters it shares, over all
 * letters), if one passes its share; the highest share wins when several do (Korean with kanji).
 */
export function scriptLanguage(text: string): Language | undefined {
  const letters = countMatches(text, /\p{L}/gu)
  if (!letters) return undefined
  let best: { code: Language; share: number } | undefined
  for (const code of LANGUAGE_CODES) {
    const recognition = LANGUAGE_MODULES[code].recognise
    if (recognition.kind !== 'script') continue
    const own = countMatches(text, recognition.letters)
    const shared = own && recognition.alsoCounts ? countMatches(text, recognition.alsoCounts) : 0
    const share = (own + shared) / letters
    if (share > recognition.share && share > (best?.share ?? 0)) best = { code, share }
  }
  return best?.code
}

/**
 * The Latin-script languages ranked by how strongly a text points to each, highest first: the
 * taught ones told by their words, and the others (others.ts) that are not taught.
 */
export function latinRanking(text: string): { code: string; score: number; taught: boolean }[] {
  const taught = LANGUAGE_CODES.flatMap((code) => {
    const recognition = LANGUAGE_MODULES[code].recognise
    return recognition.kind === 'words' ? [{ code, recognition, taught: true }] : []
  })
  const others = Object.entries(OTHER_LATIN)
    .filter(([code]) => !(code in LANGUAGE_MODULES))
    .map(([code, recognition]) => ({ code, recognition, taught: false }))
  return [...taught, ...others]
    .map(({ code, recognition, taught: isTaught }) => ({ code, score: wordScore(recognition, text), taught: isTaught }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Whether a text is mostly in the language: its script makes up its share of the letters, or (for a
 * language in Latin letters) its words and marks outweigh every other language's, at least twice.
 * For one reply or turn; detect.ts decides what a caption line is in.
 */
export function speaks(language: Language, text: string): boolean {
  if (LANGUAGE_MODULES[language].recognise.kind === 'script') return scriptLanguage(text) === language
  const [best, second] = latinRanking(text)
  return best.code === language && best.score >= 2 && best.score > (second?.score ?? 0)
}
