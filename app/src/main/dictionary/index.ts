// Dictionary entries for card backs and the word page: pronunciation, syllables, part of speech,
// gender, meanings, related words and an example.
//
// Each word comes, in order, from:
// 1. The offline dictionary pack for the language (./packs.ts, built by scripts/build-dictionaries.mjs
//    from Wiktionary, JMdict and UniDic): read from a local file, no request, no credits, offline.
// 2. An entry kept from before: the database keeps every entry the AI wrote, so the same word never
//    costs a second request.
// 3. The app's own AI (src/main/ai/entries), only for a word the pack lacks, and only while the
//    fallback is on (`aiFallback`). Off, such a word shows what Duet already knows about it.
//
// The AI's requests are kept few:
// - Entries are fetched ahead of time, several words per request (prefetch): when a card is saved,
//   when Review opens, when a session starts. By the time a card shows, its entry is usually here.
// - Asking for a word whose request is already running waits for that request; it never asks again.
// - A word the model has nothing for is remembered as missing for a month.
// - Without the AI (no API key), nothing is asked: card backs show what Duet already knows.
// What Duet already knows about a word (its card, the line it was heard in) goes with the request as
// a hint, so the meanings fit how the learner met it. Nothing here ever blocks making a card: a word
// with no entry still gets one.
import { articleFor, type DictEntry } from '../../shared/flashcards'
import type { Language } from '../../shared/types'
import type { EntryOutput, EntryRequest } from '../ai'
import { database } from '../store/db'
import type { Packs } from './packs'

// A missing word is asked about again after this long.
const MISSING_FOR_MS = 30 * 86_400_000
// A card on screen waits this long for its entry; a slower one still finishes and is kept.
const WAIT_MS = 4000
// Words in one request.
const BATCH = 12

/** The AI that writes entries (Entries in src/main/ai), or a stand-in in tests. */
export type EntryWriter = {
  lookUp(language: Language, words: EntryRequest[]): Promise<(EntryOutput | undefined)[]>
}

const form = (word: string): string => word.normalize('NFC').trim()

/** The model's answer as an entry: empty fields left out, the article worked out from the gender. */
function toEntry(language: Language, asked: string, output: EntryOutput): DictEntry | undefined {
  const word = form(output.base) || asked
  const senses = output.senses.map((sense) => sense.trim()).filter(Boolean)
  if (!senses.length) return undefined
  const gender = output.gender.trim() || undefined
  const example =
    output.example.line.trim() && output.example.translation.trim()
      ? { line: output.example.line.trim(), translation: output.example.translation.trim() }
      : undefined
  return {
    word,
    syllables: output.syllables.includes('·') ? output.syllables.trim() : undefined,
    ipa: output.ipa.trim() || undefined,
    pos: output.pos.trim().toLowerCase() || undefined,
    gender,
    article: articleFor(language, gender),
    senses: senses.slice(0, 4),
    related: output.related
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3),
    example
  }
}

export type DictionaryOptions = {
  /** The offline packs; none means every word goes to the AI. */
  packs?: Packs
  /** Whether a word the pack lacks is asked of the AI (on by default). */
  aiFallback?: boolean
}

export class Dictionary {
  private running = new Map<string, Promise<DictEntry | undefined>>()
  private readonly packs?: Packs
  private readonly writer?: EntryWriter

  /** `writer` is the app's AI; none (no API key), or the fallback off, means entries are never asked
   * for. */
  constructor(writer?: EntryWriter, options: DictionaryOptions = {}) {
    this.packs = options.packs
    this.writer = options.aiFallback === false ? undefined : writer
  }

  /** Whether entries can be asked of the AI at all. */
  get available(): boolean {
    return !!this.writer
  }

  /** The pack's entry for the word, if there is a pack and it has the word. */
  packed(language: Language, word: string): DictEntry | undefined {
    const entry = this.packs?.lookUp(language, word)
    return entry && { ...entry, article: articleFor(language, entry.gender) }
  }

  /** The entry for the word without asking: the pack's, else the one kept; null when it's known to be
   * missing, undefined when it was never asked for (or was missing long enough ago to ask again). */
  cached(language: Language, word: string, now = Date.now()): DictEntry | null | undefined {
    const packed = this.packed(language, word)
    if (packed) return packed
    const row = database()
      .prepare('SELECT entry, fetched_at FROM dictionary WHERE language = ? AND word = ?')
      .get(language, form(word)) as { entry: string | null; fetched_at: number } | undefined
    if (!row) return undefined
    if (row.entry === null) return now - row.fetched_at < MISSING_FOR_MS ? null : undefined
    try {
      return JSON.parse(row.entry) as DictEntry
    } catch {
      return undefined
    }
  }

  /** The word's entry: kept, or asked for now (the worst case: prefetching should have got it).
   * Waits at most `wait` ms; a slower answer is still kept for next time. */
  async entry(
    language: Language,
    request: EntryRequest,
    wait = WAIT_MS
  ): Promise<DictEntry | undefined> {
    const word = form(request.word)
    if (!word) return undefined
    const kept = this.cached(language, word)
    if (kept !== undefined) return kept ?? undefined
    const lookup = this.request(language, [{ ...request, word }]).get(word)
    if (!lookup) return undefined
    let timer: NodeJS.Timeout | undefined
    const late = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), wait)
    })
    try {
      return await Promise.race([lookup.catch(() => undefined), late])
    } finally {
      clearTimeout(timer)
    }
  }

  /** Fetches, in the background, the entries of the words not kept yet, several per request. */
  prefetch(language: Language, requests: EntryRequest[]): void {
    const wanted = new Map<string, EntryRequest>()
    for (const request of requests) {
      const word = form(request.word)
      if (word && !wanted.has(word) && this.cached(language, word) === undefined)
        wanted.set(word, { ...request, word })
    }
    for (const lookup of this.request(language, [...wanted.values()]).values())
      lookup.catch(() => undefined)
  }

  /** Asks for the words that aren't already being asked for, in batches; every word's answer (a new
   * request's or a running one's) by word. */
  private request(
    language: Language,
    requests: EntryRequest[]
  ): Map<string, Promise<DictEntry | undefined>> {
    const answers = new Map<string, Promise<DictEntry | undefined>>()
    const fresh: EntryRequest[] = []
    for (const request of requests) {
      const running = this.running.get(`${language}:${request.word}`)
      if (running) answers.set(request.word, running)
      else fresh.push(request)
    }
    if (!this.writer) return answers
    for (let start = 0; start < fresh.length; start += BATCH) {
      const batch = fresh.slice(start, start + BATCH)
      const asked = this.writer.lookUp(language, batch).then((outputs) =>
        batch.map((request, index) => {
          const output = outputs[index]
          const entry = output && toEntry(language, request.word, output)
          this.keep(language, request.word, entry ?? null)
          // A form asked for (madrugué) also fills in its dictionary form (madrugar).
          if (
            entry &&
            entry.word !== request.word &&
            this.cached(language, entry.word) === undefined
          )
            this.keep(language, entry.word, entry)
          return entry
        })
      )
      batch.forEach((request, index) => {
        const id = `${language}:${request.word}`
        // A failed request (offline, a model error) isn't kept, so the word is asked again later.
        const one = asked.then((entries) => entries[index]).finally(() => this.running.delete(id))
        this.running.set(id, one)
        answers.set(request.word, one)
      })
    }
    return answers
  }

  private keep(language: Language, word: string, entry: DictEntry | null): void {
    database()
      .prepare(
        `INSERT INTO dictionary (language, word, entry, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (language, word) DO UPDATE SET entry = excluded.entry, fetched_at = excluded.fetched_at`
      )
      .run(language, word, entry ? JSON.stringify(entry) : null, Date.now())
  }
}
