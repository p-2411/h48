// What crash and error reports may carry (shared/report-scrub.ts): no line, translation, word or
// address leaves Duet, while code names and error kinds stay. And how failed model requests are
// grouped (main/ai/report.ts): one outage is one kind, whichever file it came through.
// Run: npx jiti scripts/test-reports.mjs
import assert from 'node:assert/strict'
import { scrubBreadcrumb, scrubEvent, scrubText } from '../src/shared/report-scrub.ts'
import { failureKind, onModelFailure, reportModelFailure } from '../src/main/ai/report.ts'
import { ModelError } from '../src/main/ai/errors.ts'

// Quoted text goes; code names stay.
assert.equal(
  scrubText(`Unexpected token 'H', "Hola amigo" is not valid JSON`),
  'Unexpected token [text], [text] is not valid JSON'
)
assert.equal(
  scrubText(`Cannot read properties of undefined (reading 'map')`),
  `Cannot read properties of undefined (reading 'map')`
)
assert.equal(
  scrubText(`Cannot read properties of undefined (reading 'lineId')`),
  `Cannot read properties of undefined (reading 'lineId')`
)
assert.equal(scrubText(`No card for 'perro'`), 'No card for [text]')
assert.equal(
  scrubText(`Can't explain this line`),
  `Can't explain this line`,
  'an apostrophe is no quote'
)
// Japanese, Korean and Spanish text goes, quoted or not.
assert.equal(
  scrubText('Could not split そんなつもりじゃなかった into words'),
  'Could not split [text] into words'
)
assert.equal(scrubText('Bad line 안녕하세요 친구'), 'Bad line [text] [text]')
assert.equal(scrubText('Missing word mañana in ¿Qué pasa?'), 'Missing word [text] in [text] pasa?')
assert.equal(scrubText('「こんにちは」'), '[text]')
// Addresses keep their host only; the home folder and emails go.
assert.equal(
  scrubText('fetch https://www.youtube.com/watch?v=abc123&t=4 failed'),
  'fetch https://www.youtube.com/… failed'
)
assert.equal(
  scrubText('ENOENT /Users/sam/Library/Application Support/Duet/x.db'),
  'ENOENT ~/Library/Application Support/Duet/x.db'
)
assert.equal(scrubText('from sam@example.com'), 'from [email]')
assert.equal(scrubText('x'.repeat(400)).length, 301, 'long messages are cut')

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

// Events: messages scrubbed, local variables and extra data gone, the user only by id.
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
      }
    ]
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
assert.equal(event.exception.values[0].value, 'Could not translate [text]')
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
