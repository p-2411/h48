// The contract between Duet and whichever AI model processes caption lines. Nothing outside
// src/main/ai knows which provider is in use; a provider only has to turn one line (plus the lines
// before it) into a ProcessedLine. The line shapes themselves live in src/shared/types.ts because
// the overlay renders them too.
import type { Language, ProcessedLine } from '../../shared/types'

export type { Language, ProcessedLine, Token, WordJob } from '../../shared/types'

/** A line already processed earlier in the session, used as context. */
export type HistoryEntry = { line: string; translation: string }

export type LineRequest = {
  language: Language
  line: string
  history: HistoryEntry[]
}

export interface LineModel {
  /** Provider and model, for logs and settings, e.g. "anthropic/claude-opus-5-5". */
  readonly name: string
  processLine(request: LineRequest, signal?: AbortSignal): Promise<ProcessedLine>
}

export class LineModelError extends Error {
  constructor(
    message: string,
    /** Decides what the overlay says. */
    readonly kind: 'refusal' | 'invalid_output' | 'auth' | 'rate_limit' | 'network'
  ) {
    super(message)
  }
}
