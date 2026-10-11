// The mixed line: the English translation with some words swapped for their partners in the
// original, more of them at higher levels. Worked out from the word pairs alone, so changing level
// never needs another request.
import type { Level, ProcessedLine, Token, WordJob } from './types'

const SWAPPED: Record<Exclude<Level, 5>, WordJob[]> = {
  1: ['n'],
  2: ['n', 'v'],
  3: ['n', 'v', 'a'],
  4: ['n', 'v', 'a', 'p', 'x']
}

export type MixedToken = Token & { swapped: boolean }

/** Writes tokens out as they appear in the line: text, then a space where one follows. */
export function joinTokens(tokens: Token[]): string {
  return tokens.map((token) => token.text + (token.space ? ' ' : '')).join('').trim()
}

export function mixedLine(line: ProcessedLine, level: Level): MixedToken[] {
  // Level 5 is the original line itself.
  if (level === 5) return line.source.map((token) => ({ ...token, swapped: true }))
  const jobs = SWAPPED[level]
  const sourceByPair = new Map<number, Token[]>()
  for (const token of line.source) {
    if (token.pair === null) continue
    sourceByPair.set(token.pair, [...(sourceByPair.get(token.pair) ?? []), token])
  }
  const used = new Set<number>()
  const mixed: MixedToken[] = []
  for (const token of line.english) {
    const partners = token.pair === null ? undefined : sourceByPair.get(token.pair)
    if (!partners || token.pair === null || !jobs.includes(token.job)) {
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
    mixed.push({ text, job: token.job, pair: token.pair, space: token.space, swapped: true })
  }
  return mixed
}
