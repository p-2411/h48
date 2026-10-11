// The knowledge ladder, main-process side: every word the learner meets (by its key, its dictionary
// form) and what they did with it: recalled or missed in a challenge, said well or not (the coach),
// used well or not in their own sentence. Its rung is worked out from that and from its card's FSRS
// memory each time it's asked for (src/shared/knowledge.ts), so forgetting moves it back down.
// Emits "changed" when something the learner did may move a word (pages ask again).
import { EventEmitter } from 'events'
import { keyWord, LADDER, pairKeys, startsIgnored, wordKey, wordState, type WordEvidence, type WordsSummary, type WordState } from '../../shared/knowledge'
import type { Language, ProcessedLine, WordJob } from '../../shared/types'
import { retrievability } from '../cards/scheduler'
import { database, transaction } from '../store/db'

export type AttemptKind = 'recall' | 'say' | 'use'
const KINDS: AttemptKind[] = ['recall', 'say', 'use']
/** Something the learner did with a word: its key, what kind of try, whether it was good, and (for a
 * sentence of their own) that sentence. */
export type WordAttempt = { key: string; kind: AttemptKind; good: boolean; context?: string }

// Words asked about in one query (each is a parameter; SQLite takes a few hundred at most).
const BATCH = 200
// The Words place lists this many of each rung at most (the counts are of all of them).
const SUMMARY_WORDS = 500
// Talk's practice words are picked from the words said well most recently, this many.
const PRACTICE_POOL = 200
// FSRS's "Review" state: past learning and relearning (ts-fsrs State.Review).
const REVIEW = 2
const MAX_CONTEXT = 500

type WordRow = { key: string; seen: number; job: WordJob; ignored: number | null }
type EvidenceRow = { key: string; kind: AttemptKind; good: number; context: string | null; at: number }
type CardRow = { key: string; fsrs: string; state: number }

/** The word a key names in `language`; a key from another language is refused. */
function wordOf(language: Language, key: string): string {
  const word = keyWord(language, key)
  if (word === undefined) throw new Error(`Not a key in ${language}: ${key}`)
  return word
}

export class Knowledge extends EventEmitter {
  constructor() {
    super()
    // Cards saved before the ladder name no word: theirs is their expression's.
    const unnamed = database().prepare('SELECT id, language, expression FROM cards WHERE word_key IS NULL').all() as { id: string; language: Language; expression: string }[]
    const name = database().prepare('UPDATE cards SET word_key = ? WHERE id = ?')
    if (unnamed.length) transaction(() => unnamed.forEach((card) => name.run(wordKey(card.language, card.expression), card.id)))
  }

  /** A line was met: each of its words seen once more. */
  noteSeen(language: Language, line: ProcessedLine, now = Date.now()): void {
    const upsert = database().prepare(
      `INSERT INTO words (language, key, text, job, seen, first_seen, last_seen) VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT (language, key) DO UPDATE SET seen = seen + 1, text = excluded.text, job = excluded.job, last_seen = excluded.last_seen`
    )
    transaction(() => {
      for (const word of pairKeys(language, line)) upsert.run(language, word.key, word.text, word.job, now, now)
    })
  }

  /** Something the learner did with a word: a recall, a line said, a sentence of their own. */
  noteAttempt(language: Language, key: string, kind: AttemptKind, good: boolean, context?: string, now = Date.now()): void {
    this.noteAttempts(language, [{ key, kind, good, context }], now)
  }

  /** Several attempts at once (each word of a line said back, a sentence judged word by word): all
   * written or none, and told once. */
  noteAttempts(language: Language, attempts: WordAttempt[], now = Date.now()): void {
    for (const { key, kind } of attempts) {
      if (!KINDS.includes(kind)) throw new Error(`Not a kind of attempt: ${kind}`)
      wordOf(language, key)
    }
    if (!attempts.length) return
    const insert = database().prepare('INSERT INTO word_evidence (language, key, kind, good, context, at) VALUES (?, ?, ?, ?, ?, ?)')
    transaction(() => {
      for (const { key, kind, good, context } of attempts) insert.run(language, key, kind, good ? 1 : 0, context?.slice(0, MAX_CONTEXT) ?? null, now)
    })
    this.emit('changed')
  }

  /** The learner's own choice to leave a word out of colouring and practice, or bring it back. */
  setIgnored(language: Language, key: string, ignored: boolean, now = Date.now()): void {
    const word = wordOf(language, key)
    database()
      .prepare(
        `INSERT INTO words (language, key, text, job, seen, first_seen, last_seen, ignored) VALUES (?, ?, ?, 'n', 0, ?, ?, ?)
         ON CONFLICT (language, key) DO UPDATE SET ignored = excluded.ignored`
      )
      .run(language, key, word, now, now, ignored ? 1 : 0)
    this.emit('changed')
  }

  /** Every word met in `language`: how many on each rung, and the last seen of each rung. */
  summary(language: Language, now = Date.now()): WordsSummary {
    const rows = database()
      .prepare('SELECT key, text FROM words WHERE language = ? ORDER BY last_seen DESC')
      .all(language) as { key: string; text: string }[]
    const states = this.statesFor(language, rows.map((row) => row.key), now)
    const counts = Object.fromEntries([...LADDER, 'ignored'].map((state) => [state, 0])) as Record<WordState, number>
    const words: WordsSummary['words'] = []
    for (const row of rows) {
      const state = states[row.key]
      if (counts[state]++ < SUMMARY_WORDS) words.push({ key: row.key, word: wordOf(language, row.key), seenAs: row.text, state })
    }
    return { counts, words }
  }

  /** Words the learner can say but hasn't used yet (speakable), most recently said first: for Talk
   * to weave in. `word` is the dictionary form; `seenAs` the form last seen on screen. */
  practiceWords(language: Language, limit = 8, now = Date.now()): { key: string; word: string; seenAs: string }[] {
    const said = database()
      .prepare(
        `SELECT e.key, MAX(e.at) AS at, w.text FROM word_evidence e LEFT JOIN words w ON w.language = e.language AND w.key = e.key
         WHERE e.language = ? AND e.kind = 'say' AND e.good = 1 GROUP BY e.key ORDER BY at DESC LIMIT ?`
      )
      .all(language, PRACTICE_POOL) as { key: string; text: string | null }[]
    const states = this.statesFor(language, said.map((row) => row.key), now)
    return said
      .filter((row) => states[row.key] === 'speakable')
      .slice(0, limit)
      .map((row) => {
        const word = wordOf(language, row.key)
        return { key: row.key, word, seenAs: row.text ?? word }
      })
  }

  /** Each word's rung, by key (keys from another language are left out). */
  statesFor(language: Language, keys: string[], now = Date.now()): Record<string, WordState> {
    const wanted = [...new Set(keys.filter((key) => keyWord(language, key) !== undefined))]
    const states: Record<string, WordState> = {}
    for (let start = 0; start < wanted.length; start += BATCH) Object.assign(states, this.batchStates(language, wanted.slice(start, start + BATCH), now))
    return states
  }

  private batchStates(language: Language, keys: string[], now: number): Record<string, WordState> {
    const marks = keys.map(() => '?').join(', ')
    const words = database()
      .prepare(`SELECT key, seen, job, ignored FROM words WHERE language = ? AND key IN (${marks})`)
      .all(language, ...keys) as WordRow[]
    // In the order they happened (the id breaks a tie: two tries in the same millisecond).
    const evidence = database()
      .prepare(`SELECT key, kind, good, context, at FROM word_evidence WHERE language = ? AND key IN (${marks}) ORDER BY at, id`)
      .all(language, ...keys) as EvidenceRow[]
    const cards = database()
      .prepare(`SELECT word_key AS key, fsrs, state FROM cards WHERE language = ? AND deleted_at IS NULL AND word_key IN (${marks})`)
      .all(language, ...keys) as CardRow[]
    const byKey = new Map<string, WordEvidence>(keys.map((key) => [key, { seen: 0, recalls: [], says: [], uses: [] }]))
    for (const word of words) {
      const into = byKey.get(word.key)!
      into.seen = word.seen
      into.ignored = word.ignored === null ? startsIgnored(word.job) : word.ignored === 1
    }
    for (const row of evidence) {
      const into = byKey.get(row.key)!
      const attempt = { at: row.at, good: row.good === 1 }
      if (row.kind === 'recall') into.recalls.push(attempt)
      else if (row.kind === 'say') into.says.push(attempt)
      else into.uses.push({ ...attempt, context: row.context ?? '' })
    }
    // A word with several cards counts its best one: past learning first, then the best remembered.
    for (const card of cards) {
      const into = byKey.get(card.key)!
      const next = { inReview: card.state === REVIEW, retrievability: retrievability(card.fsrs, now) }
      const better = !into.card || (next.inReview && !into.card.inReview) || (next.inReview === into.card.inReview && next.retrievability > into.card.retrievability)
      if (better) into.card = next
    }
    return Object.fromEntries(keys.map((key) => [key, wordState(byKey.get(key)!)]))
  }
}
