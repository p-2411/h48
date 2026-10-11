// Turns the model's phrase list into the word tokens the overlay draws.
//
// The model only names phrases that mean the same thing ("mucha" = "a lot of") and their job. This
// file finds each phrase in the original line and in the translation, and everything the model left
// out becomes uncoloured glue. A phrase always stays whole on both sides, and the model writes far
// less than it would token by token, which is most of the wait.
import type { LinesOutput } from './prompt'
import { ModelError, type ProcessedLine, type Token, type WordJob } from './types'

export type Phrase = { source: string; english: string; job: WordJob }

type Span = { start: number; end: number; job: WordJob; pair: number | null }

const WORD_CHAR = /[\p{L}\p{N}]/u

function isWordEdge(text: string, start: number, end: number): boolean {
  return !WORD_CHAR.test(text.charAt(start - 1)) && !WORD_CHAR.test(text.charAt(end))
}

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && span.start < end)
}

/** The first free place `needle` appears in `text`, from `from` on, or -1. */
function locate(text: string, needle: string, spans: Span[], from: number, wordEdges: boolean): number {
  for (const haystack of [text, text.toLocaleLowerCase()]) {
    const target = haystack === text ? needle : needle.toLocaleLowerCase()
    for (let at = haystack.indexOf(target, from); at >= 0; at = haystack.indexOf(target, at + 1)) {
      if (overlaps(spans, at, at + target.length)) continue
      if (wordEdges && !isWordEdge(text, at, at + target.length)) continue
      return at
    }
  }
  return -1
}

/** Cuts `text` into tokens: each span is one token, and the words between spans are glue. */
function tokenize(text: string, spans: Span[]): Token[] {
  const tokens: Token[] = []
  const push = (start: number, end: number, job: WordJob, pair: number | null): void => {
    tokens.push({ text: text.slice(start, end), job, pair, space: /\s/.test(text.charAt(end)) })
  }
  const glue = (start: number, end: number): void => {
    for (const match of text.slice(start, end).matchAll(/\S+/g)) push(start + match.index, start + match.index + match[0].length, 'g', null)
  }
  let cursor = 0
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    glue(cursor, span.start)
    push(span.start, span.end, span.job, span.pair)
    cursor = span.end
  }
  glue(cursor, text.length)
  return tokens
}

/** Aligns every line of a reply; a reply with the wrong number of lines can't be matched up. */
export function alignLines(lines: string[], output: LinesOutput): ProcessedLine[] {
  if (output.lines.length !== lines.length)
    throw new ModelError(`The model returned ${output.lines.length} lines for ${lines.length}.`, 'invalid_output')
  return lines.map((line, index) => alignLine(line, output.lines[index].translation, output.lines[index].phrases))
}

export function alignLine(line: string, translation: string, phrases: Phrase[]): ProcessedLine {
  const sourceSpans: Span[] = []
  const englishSpans: Span[] = []
  // Phrases come in the order of the original line, so each is looked for after the one before.
  // Whole words are tried first ("a" should not land inside "Ha"); Japanese has no spaces, so the
  // looser searches catch it.
  let cursor = 0
  const found = phrases.map((phrase, index) => {
    const source = phrase.source.trim()
    let at = -1
    for (const [from, wordEdges] of [[cursor, true], [0, true], [cursor, false], [0, false]] as const) {
      if (!source || at >= 0) break
      at = locate(line, source, sourceSpans, from, wordEdges)
    }
    if (at >= 0) {
      sourceSpans.push({ start: at, end: at + source.length, job: phrase.job, pair: null })
      cursor = at + source.length
    }
    return { phrase, pair: index + 1, sourceAt: at }
  })
  // Longer English phrases first, so "a lot" can't take the words "a lot of" needs.
  const englishAt = new Map<number, number>()
  for (const item of [...found].sort((a, b) => b.phrase.english.length - a.phrase.english.length)) {
    const english = item.phrase.english.trim()
    if (!english) continue
    const at = locate(translation, english, englishSpans, 0, true)
    if (at < 0) continue
    englishAt.set(item.pair, at)
    englishSpans.push({ start: at, end: at + english.length, job: item.phrase.job, pair: null })
  }
  // A pair needs both sides; a phrase found on one side only is still coloured, just never swapped.
  for (const item of found) {
    if (item.sourceAt < 0 || !englishAt.has(item.pair)) continue
    sourceSpans.find((span) => span.start === item.sourceAt)!.pair = item.pair
    englishSpans.find((span) => span.start === englishAt.get(item.pair))!.pair = item.pair
  }
  return { translation, source: tokenize(line, sourceSpans), english: tokenize(translation, englishSpans) }
}
