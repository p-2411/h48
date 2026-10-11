// Checks the Explain conversation's pure rules: one card action at a time, and asking for a turn's
// meaning or romanisation once per text. Run with: npx jiti scripts/test-conversation.mjs
import assert from 'node:assert/strict'
import { aidRequester } from '../src/renderer/src/explain/aids.ts'
import { exclusive } from '../src/renderer/src/explain/exclusive.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A promise the test settles by hand. */
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => ((resolve = yes), (reject = no)))
  return { promise, resolve, reject }
}

// --- One card action at a time ---------------------------------------------------------------
{
  const busy = []
  const run = exclusive((value) => busy.push(value))
  const call = deferred()
  let calls = 0
  const task = () => (calls++, call.promise)
  // Two clicks in the same frame: the second would find the action done (ACTION_NOT_FOUND).
  const first = run(task)
  const second = run(task)
  assert.equal(calls, 1, 'A second press while the first call is out must be ignored.')
  assert.deepEqual(busy, [true], 'The buttons are disabled while the call is out.')
  call.resolve()
  await Promise.all([first, second])
  assert.deepEqual(busy, [true, false], 'The buttons are enabled again once the call is back.')

  // A failed call frees the buttons too, so the learner can try again.
  const failing = run(() => Promise.reject(new Error('NO_ACTION_TO_UNDO')))
  await assert.rejects(failing)
  assert.deepEqual(busy, [true, false, true, false], 'A failed call must not leave the buttons disabled.')
  await run(async () => calls++)
  assert.equal(calls, 2, 'After a call is back, the next press runs.')
}

// --- Meaning and romanisation, once per text ---------------------------------------------------
/** A state store like useState's setter, and the fetches it was asked for. */
function store(options) {
  let state = {}
  const asked = []
  const pending = []
  const request = aidRequester((change) => (state = change(state)), options)
  const fetcher = (text) => {
    asked.push(text)
    const call = deferred()
    pending.push(call)
    return call.promise
  }
  return { request, fetcher, asked, pending, get state() { return state } }
}

{
  const meanings = store({ fallback: 'Could not show the meaning.', retry: true })
  meanings.request('t1', 'こんにちは', meanings.fetcher)
  meanings.request('t1', 'こんにちは', meanings.fetcher)
  assert.equal(meanings.asked.length, 1, 'The same text must be asked for once (a paid call).')
  assert.equal(meanings.state.t1.loading, true)
  meanings.pending[0].resolve('Hello')
  await tick()
  assert.deepEqual(meanings.state.t1, { source: 'こんにちは', loading: false, text: 'Hello' })

  // A voice turn that grows is asked again; the answer for its older text is dropped.
  meanings.request('t2', 'おは', meanings.fetcher)
  meanings.request('t2', 'おはよう', meanings.fetcher)
  assert.equal(meanings.asked.length, 3, 'New text for a turn is asked for again.')
  meanings.pending[1].resolve('Mor')
  await tick()
  assert.equal(meanings.state.t2.loading, true, 'An answer for older text must not replace the newer request.')
  meanings.pending[2].resolve('Good morning')
  await tick()
  assert.equal(meanings.state.t2.text, 'Good morning')

  // A failed meaning reads as a sentence, and pressing Meaning again asks again.
  meanings.request('t3', 'ありがとう', meanings.fetcher)
  meanings.pending[3].reject(new Error('MOMENT_NOT_FOUND'))
  await tick()
  assert.equal(meanings.state.t3.error, 'Open Explain on a line first.', 'Error codes read as sentences.')
  meanings.request('t3', 'ありがとう', meanings.fetcher)
  assert.equal(meanings.asked.length, 5, 'After a failed meaning, Meaning again must try again.')
}

{
  // Romanisation asks by itself, so a failure is not retried on every render.
  const readings = store({ fallback: 'Could not show the romanisation.', retry: false })
  readings.request('t1', 'こんにちは', readings.fetcher)
  readings.pending[0].reject(new Error('rate limited'))
  await tick()
  assert.equal(readings.state.t1.error, 'rate limited')
  readings.request('t1', 'こんにちは', readings.fetcher)
  assert.equal(readings.asked.length, 1, 'A failed romanisation must not be asked again for the same text.')
}

console.log('Conversation checks passed.')
