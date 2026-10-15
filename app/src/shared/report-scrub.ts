// What may leave Duet in a crash or error report. Never the lines watched, their translations, what
// was heard or said, or a chat with Duet: every report and breadcrumb passes through here before it
// is sent (Sentry's beforeSend and beforeBreadcrumb, in the main process and in each page). Pure and
// free of Sentry's types, for tests (scripts/test-reports.mjs).

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
  transaction?: string
}
type ReportException = { type?: string; value?: string; stacktrace?: { frames?: ReportFrame[] } }
type ReportFrame = { vars?: unknown; filename?: string; abs_path?: string }

export type ReportBreadcrumb = {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

// Breadcrumbs kept: the app's own events, page loads, and network requests (as their host only).
// The rest go: console output can hold a line, and a click's target can carry its text.
const KEPT_BREADCRUMBS = /^(electron|navigation|http|fetch|xhr|net|child-process|sentry\.|duet)/

// Quoted text in an error message is most often data (a line, a word, a reply). Code names stay:
// TypeError's "reading 'map'" helps, and a word from a line seldom looks like one of these.
const QUOTED =
  /"[^"\n]*"|(?<![\p{L}\p{N}])'[^'\n]*'|“[^”]*”|‘[^’]*’|«[^»]*»|「[^」]*」|『[^』]*』|`[^`\n]*`/gu
const CODE_NAME = /^[_$a-z][\w$]*(?:[A-Z_$.\d][\w$.]*)+$|^[_$][\w$.]*$/
const COMMON_PROPERTIES = new Set([
  'length',
  'map',
  'filter',
  'forEach',
  'then',
  'catch',
  'push',
  'split',
  'slice',
  'trim',
  'includes',
  'replace',
  'join',
  'find',
  'some',
  'every',
  'reduce',
  'call',
  'apply',
  'bind',
  'id',
  'type',
  'value',
  'name',
  'text',
  'data',
  'state',
  'current',
  'default',
  'send',
  'on'
])
// Text in Japanese or Korean, or a word with a letter English doesn't use (¿Qué?, mañana).
const SCRIPT_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー]+/gu
const ACCENTED_WORD = /[\p{L}'’]*[À-ÖØ-öø-ÿ¿¡][\p{L}'’]*/gu
const URL = /\b(https?|wss?):\/\/([^/\s?#"'<>]+)[^\s"'<>]*/g
const FILE_URL = /\bfile:\/\/[^\s"'<>]*/g
const HOME = /(\/Users\/|\/home\/|[A-Z]:\\Users\\)[^/\\\s]+/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const LONGEST = 300

/** A message with any text that could be the learner's taken out. */
export function scrubText(text: string): string {
  const scrubbed = text
    .replace(EMAIL, '[email]')
    .replace(URL, (_, scheme: string, host: string) => `${scheme}://${host}/…`)
    .replace(FILE_URL, (url) => `file://…/${url.split('/').pop()?.split(/[?#]/)[0] ?? ''}`)
    .replace(HOME, '~')
    .replace(QUOTED, (quoted) => {
      const inner = quoted.slice(1, -1)
      return CODE_NAME.test(inner) || COMMON_PROPERTIES.has(inner) ? quoted : '[text]'
    })
    .replace(SCRIPT_TEXT, '[text]')
    .replace(ACCENTED_WORD, '[text]')
  return scrubbed.length > LONGEST ? `${scrubbed.slice(0, LONGEST)}…` : scrubbed
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
  if (typeof data.url === 'string') kept.url = scrubText(data.url)
  return {
    ...crumb,
    ...(crumb.message !== undefined && { message: scrubText(crumb.message) }),
    data: kept
  }
}

/** An event fit to send: messages scrubbed, local variables and extra data dropped, the user only
 * by their anonymous install id. Changes the event in place and returns it. */
export function scrubEvent<T extends ReportEvent>(original: T): T {
  const event: ReportEvent = original
  if (event.message) event.message = scrubText(event.message)
  if (event.logentry) {
    const { message, formatted } = event.logentry
    event.logentry = {
      ...(message !== undefined && { message: scrubText(message) }),
      ...(formatted !== undefined && { formatted: scrubText(formatted) })
    }
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value)
    scrubFrames(exception.stacktrace?.frames)
  }
  for (const thread of event.threads?.values ?? []) scrubFrames(thread.stacktrace?.frames)
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is ReportBreadcrumb => !!crumb)
  }
  if (event.request) event.request = event.request.url ? { url: scrubText(event.request.url) } : {}
  if (event.transaction) event.transaction = scrubText(event.transaction)
  delete event.extra
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  return original
}
