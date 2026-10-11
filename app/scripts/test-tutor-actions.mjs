// Tests the tutor's trusted actions (save, review, undo) without Electron: a small fake "electron"
// module stands in for the windows and IPC, and the real cards code runs on a temporary database.
// Run: npx jiti scripts/test-tutor-actions.mjs
// Plain JavaScript can not state return types, so that lint rule is off here.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-tutor-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const { EventEmitter } = require('node:events')
const handlers = new Map()
const listeners = new Map()
const windows = []
class WebContents extends EventEmitter {
  constructor() { super(); this.sent = [] }
  send(channel, value) { this.sent.push([channel, value]) }
}
class BrowserWindow extends EventEmitter {
  constructor() { super(); this.webContents = new WebContents(); this.destroyed = false; windows.push(this) }
  loadURL() {}
  loadFile() {}
  show() {}
  focus() {}
  isDestroyed() { return this.destroyed }
  close() { this.destroyed = true; this.emit('closed') }
}
const display = { workArea: { x: 0, y: 0, width: 1600, height: 1000 } }
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  ipcMain: { handle: (channel, work) => handlers.set(channel, work), on: (channel, work) => listeners.set(channel, work) },
  BrowserWindow,
  screen: { getPrimaryDisplay: () => display, getAllDisplays: () => [display] },
  dialog: {},
  is: { dev: false },
  handlers,
  listeners,
  windows
}
`
)

const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const root = resolve(import.meta.dirname, '../src/main')
const electron = await jiti.import(fakeElectron)
const { Cards } = await jiti.import(join(root, 'cards/index.ts'))
const { Tutor } = await jiti.import(join(root, 'tutor/index.ts'))
const { database } = await jiti.import(join(root, 'store/db.ts'))

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
let failures = 0
async function test(name, work) {
  try {
    await work()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`)
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message)
}

let lineId = 0
function moment(original = `テスト${++lineId}`) {
  return {
    language: 'ja',
    line: { id: lineId, original, at: Date.now(), state: 'ready' },
    earlier: [],
    video: { site: 'youtube', url: `fixture:${original}`, position: 1 },
    takenAt: Date.now()
  }
}

const nothing = () => undefined
const cards = new Cards({ replay: nothing, practise: nothing, openReview: nothing })
const tutor = new Tutor({ hold: nothing, release: nothing }, cards)
tutor.open(moment())
const tutorWindow = electron.windows.at(-1)
const fromTutor = { sender: tutorWindow.webContents }
const fromElsewhere = { sender: {} }

const call = (channel, ...args) => electron.handlers.get(channel)(fromTutor, ...args)
const learnerTurn = async (event = fromTutor) => {
  // Times are in ms: wait so the turn is clearly after the preview.
  await sleep(3)
  electron.listeners.get('tutor:learner-turn')?.(event)
}
async function tool(name, args = {}) {
  const result = await call('tutor:execute-tool', { callId: 'call', name, arguments: args })
  return { ok: result.ok, ...JSON.parse(result.output) }
}
let cardNumber = 0
async function prepareSave(overrides = {}) {
  const result = await tool('prepare_save_card', {
    expression: `表現${++cardNumber}`,
    meaning: `meaning ${cardNumber}`,
    target: `target ${cardNumber}`,
    context: [],
    source: 'tutor',
    ...overrides
  })
  expect(result.ok, `prepare_save_card failed: ${result.error}`)
  return result.action
}
/** A new saved card, through the learner's own click. */
async function savedCard(overrides) {
  const action = await prepareSave(overrides)
  const result = await call('tutor:confirm-action', action.id)
  expect(result.kind === 'saved-card', `expected a saved card, got ${result.kind}`)
  return result.card
}
/** Opens the tutor on a moment with Explore further on (opening turns it off). */
async function openOn(line = moment()) {
  tutor.open(line)
  await call('tutor:set-explore', true)
}
const cardCount = () => database().prepare('SELECT COUNT(*) n FROM cards WHERE deleted_at IS NULL').get().n

await openOn()

// 1: the voice model can not confirm its own preview.
await test('1: confirm_save_card needs a learner turn after the preview', async () => {
  const before = cardCount()
  const action = await prepareSave()
  const refused = await tool('confirm_save_card', { actionId: action.id })
  expect(!refused.ok && refused.error === 'LEARNER_CONFIRMATION_REQUIRED', `model confirmed alone: ${JSON.stringify(refused)}`)
  await learnerTurn(fromElsewhere)
  const untrusted = await tool('confirm_save_card', { actionId: action.id })
  expect(untrusted.error === 'LEARNER_CONFIRMATION_REQUIRED', 'a learner turn from another window counted')
  expect(cardCount() === before, 'a card was saved without the learner')
  await learnerTurn()
  const saved = await tool('confirm_save_card', { actionId: action.id })
  expect(saved.ok && saved.kind === 'saved-card', `learner-confirmed save failed: ${JSON.stringify(saved)}`)
})

await test('1: a learner turn before the preview does not count', async () => {
  await learnerTurn()
  await sleep(3)
  const action = await prepareSave()
  const refused = await tool('confirm_save_card', { actionId: action.id })
  expect(refused.error === 'LEARNER_CONFIRMATION_REQUIRED', `an earlier turn confirmed: ${JSON.stringify(refused)}`)
})

await test('1: commit_review needs a learner turn; the learner click does not', async () => {
  const card = await savedCard()
  const { action } = await tool('preview_review', { cardId: card.id })
  const refused = await tool('commit_review', { actionId: action.id, rating: 'good' })
  expect(refused.error === 'LEARNER_CONFIRMATION_REQUIRED', `model rated alone: ${JSON.stringify(refused)}`)
  const clicked = await call('tutor:confirm-action', action.id, 'good')
  expect(clicked.kind === 'reviewed-card', 'the learner click was refused')
})

// 2: commit tools check what kind of action they commit.
await test('2: commit tools refuse an action of the other kind', async () => {
  const save = await prepareSave()
  const card = await savedCard()
  const { action: review } = await tool('preview_review', { cardId: card.id })
  await learnerTurn()
  const wrongReview = await tool('commit_review', { actionId: save.id, rating: 'good' })
  expect(wrongReview.error === 'ACTION_NOT_FOUND', `commit_review took a save: ${JSON.stringify(wrongReview)}`)
  const wrongSave = await tool('confirm_save_card', { actionId: review.id })
  expect(wrongSave.error === 'ACTION_NOT_FOUND', `confirm_save_card took a review: ${JSON.stringify(wrongSave)}`)
})

// 3: undo reverses only the tutor's own latest rating, and says so when it can not.
await test('3: a failed undo is not retried on an older rating', async () => {
  await openOn()
  const first = await savedCard()
  const second = await savedCard()
  for (const card of [first, second]) {
    const { action } = await tool('preview_review', { cardId: card.id })
    await call('tutor:confirm-action', action.id, 'good')
  }
  // Something else reviews the second card, so its tutor rating can no longer be undone.
  database().prepare("UPDATE cards SET fsrs = json_set(fsrs, '$.reps', 99) WHERE id = ?").run(second.id)
  const firstState = database().prepare('SELECT fsrs FROM cards WHERE id = ?').get(first.id).fsrs
  const stale = await tool('undo_last_action')
  expect(stale.error === 'STALE_UNDO', `stale undo gave ${JSON.stringify(stale)}`)
  const again = await tool('undo_last_action')
  expect(again.error === 'NO_ACTION_TO_UNDO', `second undo gave ${JSON.stringify(again)}`)
  const firstAfter = database().prepare('SELECT fsrs FROM cards WHERE id = ?').get(first.id).fsrs
  expect(firstAfter === firstState, 'undo reversed a different, older rating')
})

await test('3: undoEvent refuses a rating that is not the latest', async () => {
  const { ReviewSession, StaleReviewError } = await jiti.import(join(root, 'cards/review.ts'))
  const session = new ReviewSession(null, () => undefined, () => ({ newPerDay: 10 }))
  let error
  try {
    session.undoEvent('not-rated-here')
  } catch (caught) {
    error = caught
  }
  expect(error instanceof StaleReviewError && error.code === 'STALE_UNDO', `undoEvent gave ${error}`)
})

await test('3: a new moment starts the voice review over', async () => {
  const line = moment()
  await openOn(line)
  const first = await savedCard({ source: 'video', target: 'sibling one' })
  const sibling = await savedCard({ source: 'video', target: 'sibling two' })
  const { action } = await tool('preview_review', { cardId: first.id })
  await call('tutor:confirm-action', action.id, 'good')
  const deferred = await tool('preview_review', { cardId: sibling.id })
  expect(deferred.error === 'SIBLING_CARD_DEFERRED', `sibling was not deferred: ${JSON.stringify(deferred)}`)
  await openOn()
  const fresh = await tool('preview_review', { cardId: sibling.id })
  expect(fresh.ok, `the review session was not restarted: ${JSON.stringify(fresh)}`)
})

// 4: a second preview replaces the first one.
await test('4: an older review preview is dropped', async () => {
  await openOn()
  const first = await savedCard()
  const second = await savedCard()
  const { action: older } = await tool('preview_review', { cardId: first.id })
  const { action: newer } = await tool('preview_review', { cardId: second.id })
  await learnerTurn()
  const old = await tool('commit_review', { actionId: older.id, rating: 'good' })
  expect(old.error === 'ACTION_NOT_FOUND', `older preview gave ${JSON.stringify(old)}`)
  const rated = await tool('commit_review', { actionId: newer.id, rating: 'good' })
  expect(rated.ok, `newer preview failed: ${JSON.stringify(rated)}`)
})

// 5: stale ratings get a code the model can act on.
await test('5: a changed card gives STALE_CARD_REVISION', async () => {
  const card = await savedCard()
  const { action } = await tool('preview_review', { cardId: card.id })
  database().prepare("UPDATE cards SET fsrs = json_set(fsrs, '$.reps', 99) WHERE id = ?").run(card.id)
  await learnerTurn()
  const stale = await tool('commit_review', { actionId: action.id, rating: 'good' })
  expect(stale.error === 'STALE_CARD_REVISION', `stale rating gave ${JSON.stringify(stale)}`)
})

// 6: saving a duplicate keeps the earlier undo.
await test('6: a duplicate save keeps the last undo', async () => {
  await openOn()
  const fields = { expression: '同じ', meaning: 'same', target: 'same target' }
  const card = await savedCard(fields)
  const duplicate = await call('tutor:confirm-action', (await prepareSave(fields)).id)
  expect(duplicate.kind === 'opened-existing', `expected a duplicate, got ${duplicate.kind}`)
  const undone = await tool('undo_last_action')
  expect(undone.ok && undone.kind === 'undone', `undo after a duplicate gave ${JSON.stringify(undone)}`)
  expect(!cards.store.get(card.id), 'the saved card was not removed')
})

// 7: tool arguments are bounded.
await test('7: search limit must be a finite number', async () => {
  const result = await tool('search_cards', { query: '表現', limit: Number.NaN })
  expect(result.ok && result.cards.length === 5, `NaN limit gave ${result.cards?.length} cards`)
  const two = await tool('search_cards', { query: '表現', limit: 2 })
  expect(two.cards.length === 2, `limit 2 gave ${two.cards.length} cards`)
  const many = await tool('search_cards', { query: '表現', limit: Number.POSITIVE_INFINITY })
  expect(many.cards.length === 5, `Infinity limit gave ${many.cards.length} cards`)
})

await test('7: save context is at most 12 lines', async () => {
  const result = await tool('prepare_save_card', {
    expression: '長い', meaning: 'long', target: 'long', source: 'tutor',
    context: Array.from({ length: 13 }, (_, index) => `line ${index}`)
  })
  expect(result.error === 'INVALID_CONTEXT', `13 context lines gave ${JSON.stringify(result)}`)
})

await test('8: a start-session offer without an SDP string is refused', async () => {
  let error
  try {
    await call('tutor:start-session', {})
  } catch (caught) {
    error = caught
  }
  expect(error?.message === 'INVALID_SDP_OFFER', `start-session gave ${error?.message}`)
})

tutorWindow.close()
database().close()
rmSync(folder, { recursive: true, force: true })
if (failures) {
  console.log(`${failures} tutor action test(s) failed.`)
  process.exit(1)
}
console.log('Tutor action tests passed.')
// Deleting a card schedules a purge timer; do not wait for it.
process.exit(0)
