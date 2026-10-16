// Reading Wiktionary's data (kaikki.org's extract, one JSON object per line, one per word and part
// of speech) into the dictionary entry a card's back shows. Used on our side only, by the script that
// builds the offline dictionary packs (scripts/build-dictionaries.mjs, docs/design/cards/
// dictionary-packs.md); the app reads the finished packs (./packs.ts). Pure, and tested
// (scripts/test-flashcards.mjs) so it stays honest.
import { articleFor, type DictEntry } from '../../shared/flashcards'
import type { Language } from '../../shared/types'

type Example = { text?: unknown; english?: unknown; translation?: unknown }
type Sense = {
  glosses?: unknown
  tags?: unknown
  form_of?: unknown
  alt_of?: unknown
  examples?: Example[]
}
type Linked = { word?: unknown; english?: unknown; translation?: unknown; tags?: unknown }
export type Raw = {
  word?: unknown
  pos?: unknown
  senses?: Sense[]
  sounds?: { ipa?: unknown; tags?: unknown }[]
  hyphenations?: { parts?: unknown }[]
  head_templates?: { expansion?: unknown }[]
  derived?: Linked[]
  related?: Linked[]
}

// How many senses and related words an entry keeps.
const SENSES = 4
const RELATED = 3
// Related "words" longer than this are sayings, not words.
const RELATED_WORDS = 3
// An example longer than this is a passage, not an everyday line.
const EXAMPLE_LENGTH: Record<Language, number> = { es: 80, ja: 40, ko: 50 }
// A note in brackets longer than this is an encyclopedia's, not a card's ("dog (the species…)").
const NOTE_LENGTH = 30
// Senses with these labels go after the everyday ones.
const UNUSUAL = ['obsolete', 'archaic', 'rare', 'dated', 'historical', 'dialectal']

// Wiktionary's parts of speech, in the plain English card backs show.
const POS: Record<string, string> = {
  adj: 'adjective',
  adv: 'adverb',
  intj: 'interjection',
  prep: 'preposition',
  postp: 'postposition',
  conj: 'conjunction',
  pron: 'pronoun',
  det: 'determiner',
  num: 'number',
  prep_phrase: 'phrase',
  proverb: 'saying'
}
// The script a related word must be written in, so a gloss or a character note isn't taken for one.
const SCRIPT: Record<Language, RegExp> = {
  es: /\p{Script=Latin}/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  ko: /\p{Script=Hangul}/u
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** A sense that only points at another word ("first-person singular of madrugar") says nothing new. */
function pointsElsewhere(sense: Sense): boolean {
  const tags = strings(sense.tags)
  return !!sense.form_of || !!sense.alt_of || tags.includes('form-of') || tags.includes('alt-of')
}

/** The noun's gender from its heading ("sartén m or f (plural sartenes)"), for languages with one. */
function genderOf(entries: Raw[], word: string): string | undefined {
  for (const entry of entries) {
    if (text(entry.pos) !== 'noun') continue
    for (const head of entry.head_templates ?? []) {
      const expansion = text(head.expansion)
      if (!expansion.startsWith(word)) continue
      const match = /^(m|f)(?:\s+or\s+(m|f))?(?=\s|$)/.exec(expansion.slice(word.length).trim())
      if (!match) continue
      const name = (g: string): string => (g === 'm' ? 'masculine' : 'feminine')
      return match[2] && match[2] !== match[1]
        ? `${name(match[1])} or ${name(match[2])}`
        : name(match[1])
    }
  }
  return undefined
}

/** The entry for `word` from its lines of kaikki JSON, or undefined when none of them is the word. */
export function parseEntry(language: Language, word: string, jsonl: string): DictEntry | undefined {
  const entries: Raw[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as Raw
      if (text(value.word).normalize('NFC') === word.normalize('NFC')) entries.push(value)
    } catch {
      // A damaged line is skipped; the others still count.
    }
  }
  return entryFrom(language, word, entries)
}

/** Whether a sense is only a pointer, or out of everyday use. */
const unusual = (sense: Sense): boolean => strings(sense.tags).some((tag) => UNUSUAL.includes(tag))

/** The entry for `word` from its kaikki objects (all of them the word), or undefined when there are
 * none or none has a meaning. */
export function entryFrom(language: Language, word: string, raws: Raw[]): DictEntry | undefined {
  const entries = [...raws]
  if (!entries.length) return undefined
  // Entries that only point elsewhere go last: a word's own meanings come first.
  const own = (entry: Raw): boolean => (entry.senses ?? []).some((sense) => !pointsElsewhere(sense))
  entries.sort((a, b) => Number(own(b)) - Number(own(a)))
  const first = entries[0]

  const senses: string[] = []
  const later: string[] = []
  let example: DictEntry['example']
  for (const entry of entries)
    for (const sense of entry.senses ?? []) {
      if (pointsElsewhere(sense) && own(first)) continue
      const gloss = shorten(strings(sense.glosses).join('; '))
      // A pointer to a table on the wiki, not a meaning.
      if (gloss.startsWith('More information')) continue
      const list = unusual(sense) ? later : senses
      if (gloss && !senses.includes(gloss) && !later.includes(gloss)) list.push(gloss)
      if (!example && !unusual(sense)) example = exampleOf(language, sense)
    }
  senses.push(...later)
  if (!senses.length) return undefined

  const ipa = entries
    .flatMap((entry) => entry.sounds ?? [])
    .map((sound) => text(sound.ipa))
    .filter(Boolean)
  // The broad transcription (/…/) reads better than the narrow one ([…]).
  // Some come as one ("/ˈɡɾaθjas/ [ˈɡɾa.θjas]"): the first transcription is kept.
  const broad = (ipa.find((value) => value.startsWith('/')) ?? ipa[0])?.match(
    /^\/[^/]+\/|^\[[^\]]+\]/
  )?.[0]
  // Parts come split ("ma", "dru", "gar") or as one with Wiktionary's dots ("ma‧dru‧gar").
  const parts = strings(entries.flatMap((entry) => entry.hyphenations ?? [])[0]?.parts)
    .join('‧')
    .split(/[‧·]/)
    .filter(Boolean)
  // Only plain letters: a note ("gra‧cias (Spain)") means the split can't be trusted.
  const syllables =
    parts.length > 1 && parts.every((part) => /^\p{L}+$/u.test(part)) ? parts.join('·') : undefined

  const related: string[] = []
  for (const linked of entries.flatMap((entry) => [
    ...(entry.derived ?? []),
    ...(entry.related ?? [])
  ])) {
    const name = text(linked.word)
    const tags = strings(linked.tags)
    if (
      !name ||
      !SCRIPT[language].test(name) ||
      /["“”()]/.test(name) ||
      name.split(/\s+/).length > RELATED_WORDS ||
      tags.includes('dialectal') ||
      tags.includes('obsolete')
    )
      continue
    if (/[,:;]/.test(name)) continue
    // The first of its English words is enough ("madrugador, early riser").
    const english = (text(linked.english) || text(linked.translation)).split(/[,;]/)[0].trim()
    const shown = english ? `${name}, ${english}` : name
    if (!related.some((item) => item.startsWith(name))) related.push(shown)
    if (related.length >= RELATED) break
  }

  // Only a noun has a gender (ser, the verb, isn't masculine because ser, a being, is).
  const gender = text(first.pos) === 'noun' ? genderOf(entries, word) : undefined
  return {
    word,
    syllables,
    ipa: broad,
    pos: POS[text(first.pos)] ?? (text(first.pos) || undefined),
    gender,
    article: articleFor(language, gender),
    senses: senses.slice(0, SENSES),
    related,
    example
  }
}

/** A sense's first short example that has its English. */
function exampleOf(language: Language, sense: Sense): DictEntry['example'] {
  for (const item of sense.examples ?? []) {
    const line = text(item.text)
    const translation = text(item.english) || text(item.translation)
    // In the language's own script only (a Japanese line in rōmaji is an old quote).
    const own = SCRIPT[language].test(line) && (language === 'es' || !/[A-Za-z]/.test(line))
    if (line && translation && own && line.length <= EXAMPLE_LENGTH[language])
      return { line, translation }
  }
  return undefined
}

/** A gloss without its long notes in brackets (a note's own brackets count as part of it). */
function shorten(gloss: string): string {
  let out = ''
  let depth = 0
  let note = ''
  for (const ch of gloss) {
    if (ch === '(') depth++
    if (depth > 0) note += ch
    else out += ch
    if (ch === ')' && depth > 0 && --depth === 0) {
      if (note.length - 2 < NOTE_LENGTH) out += note
      note = ''
    }
  }
  // An unclosed bracket is kept as it was.
  return (out + note)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .trim()
}

/** kaikki.org's address for one word's entries: by language name, then the word's first letter and
 * first two letters ("Spanish/meaning/s/sa/sartén.jsonl"). */
export function entryUrl(languageName: string, word: string): string {
  const letters = [...word.normalize('NFC')]
  const path = [
    languageName,
    'meaning',
    letters[0],
    letters.slice(0, 2).join(''),
    word.normalize('NFC')
  ]
  return `https://kaikki.org/dictionary/${path.map(encodeURIComponent).join('/')}.jsonl`
}
