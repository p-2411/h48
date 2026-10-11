// The line task: turning caption lines (plus the lines before them) into ProcessedLines. The line
// shapes themselves live in src/shared/types.ts because the overlay renders them too.
import type { Language, ProcessedLine } from '../../../shared/types'

export type { Language, ProcessedLine, Token, WordJob } from '../../../shared/types'

/** A line already processed earlier in the session, used as context. */
export type HistoryEntry = { line: string; translation: string }

export type LinesRequest = {
  language: Language
  /** The new lines, in order; processed together so each can use its neighbours. */
  lines: string[]
  history: HistoryEntry[]
}

export interface LineModel {
  /** Provider and model, for logs and settings, e.g. "anthropic/claude-opus-5-5". */
  readonly name: string
  /** One result per new line, in the same order. */
  processLines(request: LinesRequest, signal?: AbortSignal): Promise<ProcessedLine[]>
}

export { ModelError } from '../errors'
