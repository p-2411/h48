// PROTOTYPE, not wired into the app: reading Wiktionary's data (kaikki.org's extract, one JSON
// object per line, one per part of speech) into the dictionary entry a card's back shows. Kept for
// the dictionary packs planned in docs/design/cards/dictionary-packs.md, where a build script on our
// side will use it to slim each language's data into one file; until then card backs come from the
// app's own AI (./index.ts). Pure, and tested (scripts/test-flashcards.mjs) so it stays honest.
import { articleFor, type DictEntry } from '../../shared/flashcards'
import type { Language } from '../../shared/types'

type Sense = { glosses?: unknown; tags?: unknown; form_of?: unknown; alt_of?: unknown }
type Linked = { word?: unknown; english?: unknown; translation?: unknown; tags?: unknown }
type Raw = {
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
const SENSES = 5
const RELATED = 3
// Related "words" longer than this are sayings, not words.
const RELATED_WORDS = 3

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
  if (!entries.length) return undefined
  // Entries that only point elsewhere go last: a word's own meanings come first.
  const own = (entry: Raw): boolean => (entry.senses ?? []).some((sense) => !pointsElsewhere(sense))
  entries.sort((a, b) => Number(own(b)) - Number(own(a)))
  const first = entries[0]

  const senses: string[] = []
  for (const entry of entries)
    for (const sense of entry.senses ?? []) {
      if (pointsElsewhere(sense) && own(first)) continue
      const gloss = strings(sense.glosses).join('; ')
      if (gloss && !senses.includes(gloss)) senses.push(gloss)
    }

  const ipa = entries
    .flatMap((entry) => entry.sounds ?? [])
    .map((sound) => text(sound.ipa))
    .filter(Boolean)
  // The broad transcription (/…/) reads better than the narrow one ([…]).
  const broad = ipa.find((value) => value.startsWith('/')) ?? ipa[0]
  // Parts come split ("ma", "dru", "gar") or as one with Wiktionary's dots ("ma‧dru‧gar").
  const parts = strings(entries.flatMap((entry) => entry.hyphenations ?? [])[0]?.parts)
    .join('‧')
    .split(/[‧·]/)
    .filter(Boolean)
  const syllables = parts.length > 1 ? parts.join('·') : undefined

  const related: string[] = []
  for (const linked of entries.flatMap((entry) => [
    ...(entry.derived ?? []),
    ...(entry.related ?? [])
  ])) {
    const name = text(linked.word)
    const tags = strings(linked.tags)
    if (
      !name ||
      name.split(/\s+/).length > RELATED_WORDS ||
      tags.includes('dialectal') ||
      tags.includes('obsolete')
    )
      continue
    const english = text(linked.english) || text(linked.translation)
    const shown = english ? `${name}, ${english}` : name
    if (!related.some((item) => item.startsWith(name))) related.push(shown)
    if (related.length >= RELATED) break
  }

  const gender = genderOf(entries, word)
  return {
    word,
    syllables,
    ipa: broad,
    pos: text(first.pos) || undefined,
    gender,
    article: articleFor(language, gender),
    senses: senses.slice(0, SENSES),
    related
  }
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
