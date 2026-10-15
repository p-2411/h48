// What may leave Duet in a crash or error report. Never the lines watched, their translations, what
// was heard or said, or a chat with Duet: every report and breadcrumb passes through here before it
// is sent (Sentry's beforeSend and beforeBreadcrumb, in the main process and in each page). Pure and
// free of Sentry's types, for tests (scripts/test-reports.mjs).
//
// Messages are kept by allowlist, not cleaned by a filter: an error message can carry a line, a word
// or a reply in any language (an unaccented Spanish line looks like any English one), so only shapes
// that code makes are kept, and everything else becomes REMOVED. The stack trace, with source maps,
// still says which line of Duet threw.

/** The parts of a Sentry event this file reads or changes. */
export type ReportEvent = {
  message?: string
  logentry?: { message?: string; formatted?: string; params?: unknown[] }
  exception?: { values?: ReportException[] }
  threads?: { values?: { stacktrace?: { frames?: ReportFrame[] } }[] }
  breadcrumbs?: ReportBreadcrumb[]
  request?: { url?: string }
  user?: { id?: string | number }
  extra?: Record<string, unknown>
  contexts?: Record<string, Record<string, unknown> | undefined>
  transaction?: string
}
type ReportException = { type?: string; value?: string; stacktrace?: { frames?: ReportFrame[] } }
type ReportFrame = { vars?: unknown; filename?: string; abs_path?: string }

export type ReportBreadcrumb = {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

/** What a message that isn't on the allowlist becomes. */
export const REMOVED = '[message removed]'

// Messages kept whole: made by the JavaScript engine (with code names only), Electron and Sentry
// (a process going away: its type and reason), or Duet's own reports (src/main/reports).
const KEPT_MESSAGES = [
  /^Cannot (?:read|set) properties of (?:undefined|null) \((?:reading|setting) '[\w$]+'\)$/,
  /^[\w$.]+(?:\(\.\.\.\))? is not (?:a function|iterable|defined|a constructor|an object)$/,
  /^Maximum call stack size exceeded$/,
  /^Invalid (?:time value|array length|string length|Date)$/,
  /^Assignment to constant variable\.$/,
  /^Unexpected end of JSON input$/,
  /^(?:Failed to fetch|fetch failed|Load failed|Network request failed)$/,
  /^(?:The operation was aborted\.?|This operation was aborted|Request was aborted\.)$/,
  /^ResizeObserver loop (?:limit exceeded|completed with undelivered notifications\.)$/,
  // Duet's error codes ("EMPTY_ANSWER").
  /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/,
  /^'[\w -]+' process exited with '[\w-]+'$/,
  /^The (?:caption|audio)-reader stopped \((?:code -?\d+|code null|SIG[A-Z0-9]+|E[A-Z]+|\w+)\)$/
]
// Messages cut down to the part code made.
const CUT_MESSAGES: [RegExp, (found: RegExpExecArray) => string][] = [
  // Node's system errors name a file after the code: "ENOENT: no such file or directory, open '…'".
  [
    /^(E(?:NOENT|ACCES|PERM|PIPE|CONNRESET|CONNREFUSED|TIMEDOUT|ADDRINUSE|NOTFOUND|AI_AGAIN|EXIST|ISDIR|NOTDIR|MFILE|NOSPC|ROFS|BUSY|HOSTUNREACH|NETUNREACH))\b/,
    (found) => found[1]
  ],
  // The engine's JSON errors quote the text they couldn't read.
  [/\bJSON\b/, () => 'Invalid JSON'],
  [/^Non-Error promise rejection captured/, () => 'Non-Error promise rejection captured'],
  [/^Object captured as (?:exception|promise rejection)/, () => 'Object captured as exception']
]
// Exceptions Duet makes itself, whose message is built from code only (src/main/reports).
const OWN_EXCEPTIONS = new Set(['ModelFailure'])
// Electron's breadcrumbs name events: "app.ready", "browser-window.focus".
const EVENT_NAME = /^[\w-]+(?:\.[\w-]+)+$/

// Breadcrumbs kept: the app's own events, page loads, and network requests (as their host only).
// The rest go: console output can hold a line, and a click's target can carry its text.
const KEPT_BREADCRUMBS = /^(electron|navigation|http|fetch|xhr|net|child-process|sentry\.|duet)/

const URL = /\b(https?|wss?):\/\/([^/\s?#"'<>]+)[^\s"'<>)]*/g
const FILE_URL = /\bfile:\/\/[^\s"'<>)]*/g
const HOME = /(\/Users\/|\/home\/|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/])[^/\\\s]+/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g

/** A message if it has a shape code makes, cut to its safe part; REMOVED otherwise. */
export function safeMessage(text: string): string {
  const message = text.trim()
  if (KEPT_MESSAGES.some((shape) => shape.test(message))) return message
  for (const [shape, cut] of CUT_MESSAGES) {
    const found = shape.exec(message)
    if (found) return cut(found)
  }
  return REMOVED
}

/** An address or path with only where it points kept: a site's host, a file's name, no home
 * folder (it holds the user's name), no email. */
export function scrubPlace(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(URL, (_, scheme: string, host: string) => `${scheme}://${host}/…`)
    .replace(FILE_URL, (url) => `file://…/${url.split('/').pop()?.split(/[?#]/)[0] ?? ''}`)
    .replace(HOME, '~')
}

function scrubFrames(frames?: ReportFrame[]): void {
  for (const frame of frames ?? []) {
    // Local variables could hold anything; Duet never sends them.
    delete frame.vars
    if (frame.filename) frame.filename = frame.filename.replace(HOME, '~')
    if (frame.abs_path) frame.abs_path = frame.abs_path.replace(HOME, '~')
  }
}

/** A breadcrumb fit to send, or null to drop it. */
export function scrubBreadcrumb<T extends ReportBreadcrumb>(crumb: T): T | null {
  if (!crumb.category || !KEPT_BREADCRUMBS.test(crumb.category)) return null
  const data = crumb.data ?? {}
  const kept: Record<string, unknown> = {}
  for (const key of ['method', 'status_code', 'reason', 'type', 'exitCode']) {
    if (typeof data[key] === 'string' || typeof data[key] === 'number') kept[key] = data[key]
  }
  if (typeof data.url === 'string') kept.url = scrubPlace(data.url)
  const { message, ...rest } = crumb
  const safe = message === undefined || EVENT_NAME.test(message) ? message : safeMessage(message)
  return {
    ...rest,
    ...(safe !== undefined && safe !== REMOVED && { message: safe }),
    data: kept
  } as T
}

/** An event fit to send: messages by allowlist, places scrubbed, local variables and extra data
 * dropped, the user only by their anonymous install id. Changes the event in place and returns it. */
export function scrubEvent<T extends ReportEvent>(original: T): T {
  const event: ReportEvent = original
  if (event.message) event.message = safeMessage(event.message)
  if (event.logentry) {
    const { message, formatted } = event.logentry
    event.logentry = {
      ...(message !== undefined && { message: safeMessage(message) }),
      ...(formatted !== undefined && { formatted: safeMessage(formatted) })
    }
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value && !OWN_EXCEPTIONS.has(exception.type ?? ''))
      exception.value = safeMessage(exception.value)
    scrubFrames(exception.stacktrace?.frames)
  }
  for (const thread of event.threads?.values ?? []) scrubFrames(thread.stacktrace?.frames)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is ReportBreadcrumb => !!crumb)
  }
  if (event.request) event.request = event.request.url ? { url: scrubPlace(event.request.url) } : {}
  if (event.transaction) event.transaction = scrubPlace(event.transaction)
  // Contexts (the OS, the app, React's component stack) carry no content, but can carry paths.
  for (const context of Object.values(event.contexts ?? {})) {
    for (const [key, value] of Object.entries(context ?? {})) {
      if (typeof value === 'string') context![key] = scrubPlace(value)
    }
  }
  delete event.extra
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  return original
}
