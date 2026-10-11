// The knowledge ladder, main-process side: every word the learner meets (by its key, its dictionary
// form) and what they did with it: recalled or missed in a challenge, said well or not (the coach),
// used well or not in their own sentence. Its rung is worked out from that and from its card's FSRS
// memory each time it's asked for (src/shared/knowledge.ts), so forgetting moves it back down.
// Emits "changed" when something the learner did may move a word (pages ask again).
import { EventEmitter } from 'events'
import { IGNORED_JOBS, LADDER, pairKeys, wordKey, wordState, type WordEvidence, type WordsSummary, type WordState } from '../../shared/knowledge'
import type { Language, ProcessedLine } from '../../shared/types'
import { retrievability } from '../cards/scheduler'
import { database, transaction } from '../store/db'

export type AttemptKind = 'recall' | 'say' | 'use'
const KINDS: AttemptKind[] = ['recall', 'say', 'use']
// A page asks about at most this many words at once (a line has a handful).
export const MAX_KEYS = 200
// The Words place lists this many words at most (the counts are of all of them).
const SUMMARY_WORDS = 500

type WordRow = { key: string; seen: number; job: string; ignored: number | null }
type EvidenceRow = { key: string; kind: AttemptKind; good: number; context: string | null; at: number }
type CardRow = { key: string; fsrs: string; state: number }

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
    if (!KINDS.includes(kind)) throw new Error(`Not a kind of attempt: ${kind}`)
    if (!key.startsWith(`${language}:`)) throw new Error(`Not a key in ${language}: ${key}`)
    database()
      .prepare('INSERT INTO word_evidence (language, key, kind, good, context, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(language, key, kind, good ? 1 : 0, context?.slice(0, 500) ?? null, now)
    this.emit('changed')
  }

  /** The learner's own choice to leave a word out of colouring and practice, or bring it back. */
  setIgnored(language: Language, key: string, ignored: boolean, now = Date.now()): void {
    if (!key.startsWith(`${language}:`)) throw new Error(`Not a key in ${language}: ${key}`)
    database()
      .prepare(
        `INSERT INTO words (language, key, text, job, seen, first_seen, last_seen, ignored) VALUES (?, ?, ?, 'n', 0, ?, ?, ?)
         ON CONFLICT (language, key) DO UPDATE SET ignored = excluded.ignored`
      )
      .run(language, key, key.slice(language.length + 1), now, now, ignored ? 1 : 0)
    this.emit('changed')
  }

  /** Every word met in `language`: how many on each rung, and the last seen. */
  summary(language: Language, now = Date.now()): WordsSummary {
    const rows = database()
      .prepare('SELECT key, text FROM words WHERE language = ? ORDER BY last_seen DESC')
      .all(language) as { key: string; text: string }[]
    const states: Record<string, WordState> = {}
    for (let start = 0; start < rows.length; start += MAX_KEYS)
      Object.assign(states, this.statesFor(language, rows.slice(start, start + MAX_KEYS).map((row) => row.key), now))
    const counts = Object.fromEntries([...LADDER, 'ignored'].map((state) => [state, 0])) as Record<WordState, number>
    for (const row of rows) counts[states[row.key]]++
    const words = rows.slice(0, SUMMARY_WORDS).map((row) => ({ key: row.key, word: row.key.slice(language.length + 1), seenAs: row.text, state: states[row.key] }))
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
      .all(language, MAX_KEYS) as { key: string; text: string | null }[]
    const states = this.statesFor(language, said.map((row) => row.key), now)
    return said
      .filter((row) => states[row.key] === 'speakable')
      .slice(0, limit)
      .map((row) => {
        const word = row.key.slice(language.length + 1)
        return { key: row.key, word, seenAs: row.text ?? word }
      })
  }

  /** Each word's rung, by key. */
  statesFor(language: Language, keys: string[], now = Date.now()): Record<string, WordState> {
    const wanted = [...new Set(keys.filter((key) => typeof key === 'string' && key.startsWith(`${language}:`)))].slice(0, MAX_KEYS)
    if (!wanted.length) return {}
    const marks = wanted.map(() => '?').join(', ')
    const words = database()
      .prepare(`SELECT key, seen, job, ignored FROM words WHERE language = ? AND key IN (${marks})`)
      .all(language, ...wanted) as WordRow[]
    const evidence = database()
      .prepare(`SELECT key, kind, good, context, at FROM word_evidence WHERE language = ? AND key IN (${marks}) ORDER BY at`)
      .all(language, ...wanted) as EvidenceRow[]
    const cards = database()
      .prepare(
        `SELECT word_key AS key, fsrs, state FROM cards WHERE language = ? AND deleted_at IS NULL AND word_key IN (${marks})`
      )
      .all(language, ...wanted) as CardRow[]
    const byKey = new Map<string, WordEvidence>(wanted.map((key) => [key, { seen: 0, recalls: [], says: [], uses: [] }]))
    for (const word of words) {
      const into = byKey.get(word.key)!
      into.seen = word.seen
      into.ignored = word.ignored === null ? IGNORED_JOBS.includes(word.job as never) : word.ignored === 1
    }
    for (const row of evidence) {
      const into = byKey.get(row.key)!
      const attempt = { at: row.at, good: row.good === 1 }
      if (row.kind === 'recall') into.recalls.push(attempt)
      else if (row.kind === 'say') into.says.push(attempt)
      else into.uses.push({ ...attempt, context: row.context ?? '' })
    }
    // A word with several cards counts its best-remembered one.
    for (const card of cards) {
      const into = byKey.get(card.key)!
      const chance = retrievability(card.fsrs, now)
      if (!into.card || chance > into.card.retrievability) into.card = { reviewed: card.state !== 0, retrievability: chance }
    }
    return Object.fromEntries(wanted.map((key) => [key, wordState(byKey.get(key)!)]))
  }
}
