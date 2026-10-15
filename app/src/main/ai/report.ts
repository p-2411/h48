// Model failures, for the crash and error reports (src/main/reports). Each provider file tells this
// one when a request fails; the reports decide what to send. Only what failed and how leaves here
// (provider, model, task, kind of failure, HTTP status), never the request or the error's message,
// which can quote what was sent. Free of Electron and Sentry, so the AI files stay testable alone.
import { duetModelError, ModelError } from './errors'

export type ModelFailure = {
  provider: string
  model?: string
  /** What the request was for: a fixed name from the code ("lines", "transcribe"). */
  task: string
  /** ModelError's kind, "http_503" for another API error, or "error" for anything else. */
  kind: string
  /** The error's class ("InternalServerError"), for telling failures of one kind apart. */
  name: string
}

let listener: ((failure: ModelFailure) => void) | undefined

const className = (error: unknown): string =>
  (error as { constructor?: { name?: string } } | null)?.constructor?.name ?? typeof error

/** Who hears of failures (src/main/reports, once it is running). */
export function onModelFailure(next: (failure: ModelFailure) => void): void {
  listener = next
}

/** What kind of failure an error is, or undefined when it isn't one: the request was cancelled, or
 * Duet's server refused it (a cap reached, signed out), which is the plan working, not a failure. */
export function failureKind(error: unknown): string | undefined {
  if (error instanceof ModelError) return error.kind === 'quota' ? undefined : error.kind
  if (duetModelError(error)) return undefined
  if ((error instanceof Error && error.name === 'AbortError') || /UserAbort/.test(className(error)))
    return undefined
  // Grouped like ModelError's kinds, so one outage is one issue whichever file it came through.
  if (/Connection/.test(className(error))) return 'network'
  const status = (error as { status?: unknown } | undefined)?.status
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (typeof status === 'number') return `http_${status}`
  return 'error'
}

/** Tells the reports a request failed (the caller still throws as before). */
export function reportModelFailure(
  where: { provider: string; model?: string; task: string },
  error: unknown
): void {
  const kind = failureKind(error)
  if (!kind || !listener) return
  try {
    listener({ ...where, kind, name: className(error) })
  } catch {
    // A report must never break the request's own error handling.
  }
}
