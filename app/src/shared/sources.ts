// The open data Duet is built on, and the credit each licence asks for. Settings → Sources shows
// them (a screen of its own, as JMdict's licence asks of an app). Add a dataset here when every
// language uses it, or to the language's own folder (shared/languages/<code>, `sources`) when only
// that one does; scripts/build-dictionaries.mjs says which pack uses which.
import { LANGUAGE_CODES, languageModule, languageName } from './languages'

export type Source = {
  name: string
  /** Who made it. */
  by: string
  /** What Duet uses it for. */
  use: string
  licence: string
  licenceUrl: string
  url: string
  /** Whether Duet's copy is changed from the original (CC BY-SA asks to say so). */
  changed?: string
  /** A notice the licence asks to be shown in full. */
  notice?: string
}

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/'

/** "Spanish, Japanese and Korean" */
function names(list: string[]): string {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join('')
}

const SHARED: Source[] = [
  {
    name: 'Wiktionary',
    by: 'Wiktionary’s contributors, extracted by kaikki.org (wiktextract, Tatu Ylonen)',
    use: `Dictionary entries (${names(LANGUAGE_CODES.map(languageName))}): pronunciation, word type, meanings, examples and related words, and syllables and gender where a language has them`,
    licence: 'CC BY-SA 4.0 and GFDL',
    licenceUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
    url: 'https://kaikki.org/dictionary/',
    changed:
      'Shortened to the most common words and the fields a card shows. Duet’s dictionary files keep this licence.'
  },
  {
    name: 'wordfreq',
    by: 'Robyn Speer (data from OpenSubtitles, SUBTLEX, Wikipedia and other sources)',
    use: 'How common each word is: reading levels, and which words the dictionaries keep',
    licence: 'CC BY-SA 4.0',
    licenceUrl: CC_BY_SA,
    url: 'https://github.com/rspeer/wordfreq'
  }
]

/** Every dataset: the shared ones, with each language's own after Wiktionary. */
export const SOURCES: Source[] = [
  SHARED[0],
  ...LANGUAGE_CODES.flatMap((code) => languageModule(code).sources ?? []),
  ...SHARED.slice(1)
]
