// The mixed line: the English translation with some words swapped for their partners in the
// original, more of them at higher levels; at Auto, the words of level 1 and every word the learner
// knows (the knowledge ladder). Worked out from the word pairs alone, so changing level never needs
// another request.
import type { WordState } from './knowledge'
import type { Level, ProcessedLine, Token, WordJob, WordScript } from './types'

/** The level that follows the learner: level 1's words, and every word they know. */
export const AUTO = 0

// The rungs at which Auto swaps a word in, whatever its job.
const KNOWN: WordState[] = ['known', 'speakable', 'usable']

/** Whether `value` is a level (what the strip may set). */
export function isLevel(value: unknown): value is Level {
  return typeof value === 'number' && Number.isInteger(value) && value >= AUTO && value <= 5
}

const SWAPPED: Record<Exclude<Level, 0 | 5>, WordJob[]> = {
  1: ['n'],
  2: ['n', 'v'],
  3: ['n', 'v', 'a'],
  4: ['n', 'v', 'a', 'p', 'x']
}

export type MixedToken = Token & { swapped: boolean }

/** Writes tokens out as they appear in the line: text, then a space where one follows. */
export function joinTokens(tokens: Token[]): string {
  return tokens
    .map((token) => token.text + (token.space ? ' ' : ''))
    .join('')
    .trim()
}

/** One pair's words in a line, written out: what the strip names for a word (its popup, a hover). */
export function pairText(tokens: Token[], pair: number): string {
  return joinTokens(tokens.filter((token) => token.pair === pair))
}

/** How a pair's words are read, in Latin letters, when the line has their reading. */
export function pairReading(tokens: Token[], pair: number): string | undefined {
  const words = tokens.filter((token) => token.pair === pair)
  if (!words.length || words.some((token) => !token.reading)) return undefined
  return words.map((token) => token.reading).join(' ')
}

/** A word as the strip writes it: in its own script, or in its reading (Latin letters) when the
 * learner chose that and the line has one. */
export function written(token: Token, script: WordScript): string {
  return script === 'reading' && token.reading ? token.reading : token.text
}

/** The line as the strip shows it at `level`. At Auto, `stateOf` gives each pair's rung (without it,
 * Auto is level 1); an ignored word stays in English. */
export function mixedLine(line: ProcessedLine, level: Level, stateOf?: (pair: number) => WordState): MixedToken[] {
  // Level 5 is the original line itself.
  if (level === 5) return line.source.map((token) => ({ ...token, swapped: true }))
  const jobs = SWAPPED[level === AUTO ? 1 : level]
  const swaps = (token: Token): boolean => {
    if (level !== AUTO || !stateOf || token.pair === null) return jobs.includes(token.job)
    const state = stateOf(token.pair)
    return state !== 'ignored' && (KNOWN.includes(state) || jobs.includes(token.job))
  }
  const sourceByPair = new Map<number, Token[]>()
  for (const token of line.source) {
    if (token.pair === null) continue
    sourceByPair.set(token.pair, [...(sourceByPair.get(token.pair) ?? []), token])
  }
  const used = new Set<number>()
  const mixed: MixedToken[] = []
  for (const token of line.english) {
    const partners = token.pair === null ? undefined : sourceByPair.get(token.pair)
    if (!partners || token.pair === null || !swaps(token)) {
      mixed.push({ ...token, swapped: false })
      continue
    }
    // A phrase pair is swapped once, at its first English word; the rest of the phrase is dropped.
    if (used.has(token.pair)) continue
    used.add(token.pair)
    let text = joinTokens(partners)
    // A word that opened the original sentence loses its capital mid-line, unless it is a name.
    if (mixed.length > 0 && partners[0] === line.source[0] && token.job !== 'x')
      text = text.charAt(0).toLocaleLowerCase() + text.slice(1)
    // Its reading goes with it, so the strip can write it in Latin letters (a setting).
    const reading = pairReading(partners, token.pair)
    const base = partners[0].base
    mixed.push({ text, job: token.job, pair: token.pair, space: token.space, swapped: true, ...(reading && { reading }), ...(base && { base }) })
  }
  return mixed
}
