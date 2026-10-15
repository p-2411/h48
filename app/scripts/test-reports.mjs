// What crash and error reports may carry (shared/report-scrub.ts): no line, translation, word or
// address leaves Duet, while code names and error kinds stay. And how failed model requests are
// grouped (main/ai/report.ts): one outage is one kind, whichever file it came through.
// Run: npx jiti scripts/test-reports.mjs
import assert from 'node:assert/strict'
import {
  REMOVED,
  safeMessage,
  scrubBreadcrumb,
  scrubEvent,
  scrubPlace
} from '../src/shared/report-scrub.ts'
import { failureKind, onModelFailure, reportModelFailure } from '../src/main/ai/report.ts'
import { ModelError } from '../src/main/ai/errors.ts'

// Messages are kept only in shapes code makes; anything else is removed, in any language.
const removed = [
  'Could not answer: Hola amigo, como estas',
  'Not a key in es: perro',
  'Could not explain: sonna tsumori ja nakatta',
  'Could not answer: I never meant it like that',
  `No card for 'perro'`,
  'Could not split そんなつもりじゃなかった into words',
  'Bad line 안녕하세요 친구',
  'Missing word mañana in ¿Qué pasa?',
  'x'.repeat(400)
]
for (const message of removed) assert.equal(safeMessage(message), REMOVED, message)
// The engine's own messages stay, with code names.
for (const kept of [
  `Cannot read properties of undefined (reading 'map')`,
  `Cannot set properties of null (setting 'lineId')`,
  'line.words.map is not a function',
  'Maximum call stack size exceeded',
  'Failed to fetch',
  'EMPTY_ANSWER',
  `'GPU' process exited with 'oom'`,
  `'strip' process exited with 'crashed'`,
  'The caption-reader stopped (SIGKILL)',
  'The audio-reader stopped (code 1)'
])
  assert.equal(safeMessage(kept), kept, kept)
// Some are cut to the part code made.
assert.equal(safeMessage(`Unexpected token 'H', "Hola amigo" is not valid JSON`), 'Invalid JSON')
assert.equal(
  safeMessage(`ENOENT: no such file or directory, open '/Users/sam/Duet/x.db'`),
  'ENOENT'
)
assert.equal(
  safeMessage('Non-Error promise rejection captured with value: Hola amigo'),
  'Non-Error promise rejection captured'
)
// A process's type and reason stay apart, so each crash kind is its own issue.
assert.notEqual(
  safeMessage(`'GPU' process exited with 'oom'`),
  safeMessage(`'strip' process exited with 'crashed'`)
)

// Places keep where they point only: a host, a file's name, no home folder, no email.
assert.equal(
  scrubPlace('fetch https://www.youtube.com/watch?v=abc123&t=4 failed'),
  'fetch https://www.youtube.com/… failed'
)
assert.equal(
  scrubPlace('/Users/sam/Library/Application Support/Duet/x.db'),
  '~/Library/Application Support/Duet/x.db'
)
assert.equal(scrubPlace('C:\\Users\\sam\\AppData\\Local\\Duet'), '~\\AppData\\Local\\Duet')
assert.equal(scrubPlace('from sam@example.com'), 'from [email]')

// Breadcrumbs: console and clicks go; requests keep method, status and host.
assert.equal(scrubBreadcrumb({ category: 'console', message: 'line: Hola' }), null)
assert.equal(scrubBreadcrumb({ category: 'ui.click', message: 'span.word' }), null)
assert.equal(scrubBreadcrumb({ message: 'no category' }), null)
assert.deepEqual(
  scrubBreadcrumb({
    category: 'fetch',
    data: {
      method: 'POST',
      url: 'https://api.openai.com/v1/responses?x=1',
      status_code: 503,
      body: 'Hola'
    }
  }),
  { category: 'fetch', data: { method: 'POST', status_code: 503, url: 'https://api.openai.com/…' } }
)
assert.equal(scrubBreadcrumb({ category: 'electron', message: 'app.ready' })?.message, 'app.ready')

// Events: messages by allowlist, paths scrubbed (React's component stack too), local variables and
// extra data gone, the user only by id.
const event = scrubEvent({
  message: 'Line "Te quiero" failed',
  logentry: { message: 'Line %s failed', params: ['Te quiero'] },
  exception: {
    values: [
      {
        type: 'Error',
        value: `Could not translate 'Te quiero'`,
        stacktrace: {
          frames: [{ filename: '/Users/sam/app/out/main/index.js', vars: { text: 'Te quiero' } }]
        }
      },
      { type: 'ModelFailure', value: 'openai lines_es failed: http_503' }
    ]
  },
  contexts: {
    react: {
      componentStack:
        '\n    at Overlay (file:///C:/Users/sam/AppData/Local/Programs/duet/resources/app.asar/out/renderer/assets/index-abc.js:12:34)'
    },
    os: { name: 'macOS', version: '15.0' }
  },
  breadcrumbs: [
    { category: 'console', message: 'Te quiero' },
    { category: 'navigation', data: { from: 'a', to: 'b' } }
  ],
  request: {
    url: 'file:///Users/sam/app/out/renderer/home.html?line=Te%20quiero',
    headers: { a: 'b' }
  },
  user: { id: 'install-1', ip_address: '1.2.3.4', email: 'sam@example.com' },
  extra: { line: 'Te quiero' }
})
const sent = JSON.stringify(event)
assert.ok(!sent.includes('quiero'), `no line text in the event: ${sent}`)
assert.ok(!sent.includes('sam'), `no user name in the event: ${sent}`)
assert.equal(event.exception.values[0].value, REMOVED)
assert.equal(event.exception.values[1].value, 'openai lines_es failed: http_503', 'Duet’s own stay')
assert.equal(event.message, REMOVED)
assert.equal(event.contexts.react.componentStack, '\n    at Overlay (file://…/index-abc.js:12:34)')
assert.equal(event.contexts.os.name, 'macOS')
assert.equal(event.exception.values[0].stacktrace.frames[0].vars, undefined)
assert.equal(event.breadcrumbs.length, 1)
assert.deepEqual(event.user, { id: 'install-1' })
assert.equal(event.extra, undefined)
assert.equal(event.request.url, 'file://…/home.html')

// Model failures: grouped by kind; a cancelled request is no failure.
assert.equal(failureKind(new ModelError('Rate limited by OpenAI.', 'rate_limit')), 'rate_limit')
assert.equal(failureKind(Object.assign(new Error('x'), { status: 429 })), 'rate_limit')
assert.equal(failureKind(Object.assign(new Error('x'), { status: 401 })), 'auth')
assert.equal(failureKind(Object.assign(new Error('Internal'), { status: 503 })), 'http_503')
class APIConnectionError extends Error {}
assert.equal(failureKind(new APIConnectionError('fetch failed')), 'network')
assert.equal(failureKind(Object.assign(new Error('aborted'), { name: 'AbortError' })), undefined)
class APIUserAbortError extends Error {}
assert.equal(failureKind(new APIUserAbortError('Request was aborted.')), undefined)
assert.equal(failureKind(new TypeError('boom')), 'error')
// Duet's server refusing (a cap reached, signed out) is no failure; its other errors are.
const duetError = (status, code) =>
  Object.assign(new Error('x'), { status, error: { type: 'duet', code } })
assert.equal(failureKind(duetError(401)), undefined)
const capReached = Object.assign(new Error('x'), {
  status: 402,
  error: { type: 'duet', code: 'usage_cap', cap: 'credits', resets_at: '2026-11-01T00:00:00Z' }
})
assert.equal(failureKind(capReached), undefined)
assert.equal(failureKind(new ModelError('This month’s credits are used up.', 'quota')), undefined)
assert.equal(failureKind(duetError(500)), 'http_500')

const heard = []
onModelFailure((failure) => heard.push(failure))
reportModelFailure(
  { provider: 'openai', model: 'gpt', task: 'lines' },
  Object.assign(new Error('Hola'), { status: 503 })
)
reportModelFailure({ provider: 'openai', task: 'lines' }, new APIUserAbortError('aborted'))
assert.deepEqual(heard, [
  { provider: 'openai', model: 'gpt', task: 'lines', kind: 'http_503', name: 'Error' }
])
// A listener that throws never breaks the request's own error handling.
onModelFailure(() => {
  throw new Error('report failed')
})
reportModelFailure({ provider: 'openai', task: 'lines' }, new Error('x'))

console.log('Report scrubbing and model failure tests passed.')
