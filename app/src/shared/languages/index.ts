// The languages Duet teaches. Adding one: a file beside this one that fills in LanguageModule (see
// module.ts), and a line in LANGUAGE_MODULES. Everything else (the settings, the welcome window,
// the line and tutor prompts, caption detection, the card schema) reads the list from here.
import { es } from './es'
import { ja } from './ja'
import { ko } from './ko'
import type { LanguageModule } from './module'

export type { LanguageModule, Recognition } from './module'

export const LANGUAGE_MODULES = { es, ja, ko } satisfies Record<string, LanguageModule>

export type Language = keyof typeof LANGUAGE_MODULES

export const LANGUAGE_CODES = Object.keys(LANGUAGE_MODULES) as [Language, ...Language[]]

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

/** How strongly a text in Latin letters points to a language that is told by its words and marks. */
export function wordScore(recognition: Extract<LanguageModule['recognise'], { kind: 'words' }>, text: string): number {
  const words = text.toLocaleLowerCase().match(/[\p{L}']+/gu) ?? []
  const common = words.filter((word) => recognition.words.includes(word)).length
  return common + recognition.marks.reduce((sum, mark) => sum + countMatches(text, mark.pattern) * mark.weight, 0)
}

/**
 * Whether a text is (at least partly) in the language: some of its script, or a couple of its words
 * or marks. Looser than detect.ts, which decides what a whole caption line is in.
 */
export function speaks(language: Language, text: string): boolean {
  const recognition = LANGUAGE_MODULES[language].recognise
  if (recognition.kind === 'script') return countMatches(text, recognition.letters) > 0
  return wordScore(recognition, text) >= 2
}
