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
const cards = new Cards({ replay: nothing, practise: nothing, open: nothing })
// The window the conversation lives in (here the side panel): only its page may talk to the tutor.
const panelPage = { sent: [] }
const panel = {
  owns: (sender) => sender === panelPage,
  send: (channel, value) => panelPage.sent.push([channel, value])
}
const tutor = new Tutor({ hold: nothing, release: nothing }, cards)
tutor.open({ moment: moment() }, panel)
const fromTutor = { sender: panelPage }
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
  tutor.open({ moment: line }, panel)
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

await test('9: a missed word becomes a card, or its card comes due now', () => {
  const draft = {
    type: 'understand',
    language: 'ja',
    source: { kind: 'video', moment: moment('親友と映画を見た') },
    expression: '親友',
    meaning: 'best friend',
    target: '親友 = best friend'
  }
  const saved = []
  const listen = (card) => saved.push(card)
  cards.on('saved', listen)
  const first = cards.missed(draft)
  cards.off('saved', listen)
  expect(first.made === true, 'a word with no card gets one')
  expect(saved.length === 0, 'a missed word is not a saved one (the watch log keeps it as missed)')
  // Its card was reviewed and is due in ten days; missing the word again brings it forward.
  const later = Date.now() + 10 * 86_400_000
  database().prepare('UPDATE cards SET due = ? WHERE id = ?').run(later, first.card.id)
  const again = cards.missed(draft)
  expect(again.made === false && again.card.id === first.card.id, 'the same word from the same line is the same card')
  expect(again.card.due <= Date.now(), `the card should be due now, not ${new Date(again.card.due).toISOString()}`)
  const stored = database().prepare('SELECT due, fsrs FROM cards WHERE id = ?').get(first.card.id)
  expect(stored.due <= Date.now() && new Date(JSON.parse(stored.fsrs).due).getTime() <= Date.now(), 'the scheduler state is due now too')
})

await test('10: a conversation belongs to the window that opened it', async () => {
  // The strip opens one: now only the strip's page may talk to the tutor, and it hears from it.
  const stripPage = { sent: [] }
  const strip = { owns: (sender) => sender === stripPage, send: (channel, value) => stripPage.sent.push([channel, value]) }
  tutor.open({ moment: moment() }, strip)
  let refused
  try {
    await electron.handlers.get('tutor:set-explore')(fromTutor, true)
  } catch (error) {
    refused = error
  }
  expect(refused?.message === 'UNTRUSTED_TUTOR_CALLER', 'the panel may not talk to the strip\'s conversation')
  expect((await electron.handlers.get('tutor:set-explore')({ sender: stripPage }, true)) === true, 'the strip may')
  // Ending the strip's conversation doesn't end another window's.
  tutor.open({ moment: moment() }, panel)
  tutor.end(strip)
  expect((await electron.handlers.get('tutor:set-explore')(fromTutor, false)) === false, 'the panel\'s conversation goes on')
  tutor.end(panel)
  let ended
  try {
    await electron.handlers.get('tutor:set-explore')(fromTutor, true)
  } catch (error) {
    ended = error
  }
  expect(ended?.message === 'UNTRUSTED_TUTOR_CALLER', 'an ended conversation has no window')
})

await test('11: a window that lost the conversation gets it back, on its own line', async () => {
  // The panel talks about one line; then the strip opens the tutor on another.
  const panelLine = moment('パネルの行')
  const stripPage = {}
  const strip = { owns: (sender) => sender === stripPage, send: nothing }
  const panelThread = tutor.forWindow(panel, () => ({ moment: panelLine }))
  tutor.open({ moment: panelLine }, panel)
  panelThread.update({ conversation: [{ from: 'learner', text: 'こんにちは', via: 'text' }] })
  tutor.open({ moment: moment('ストリップの行') }, strip)
  // The panel's late news doesn't reach the strip's conversation.
  panelThread.update({ conversation: [{ from: 'learner', text: 'まだパネル', via: 'text' }] })
  tutor.update(panel, { explanation: { meaning: 'not the strip line' } })
  const onStrip = JSON.parse((await electron.handlers.get('tutor:execute-tool')({ sender: stripPage }, { callId: 'c', name: 'get_current_moment', arguments: {} })).output)
  expect(onStrip.selectedLine === 'ストリップの行', `the strip's conversation keeps its line, not ${onStrip.selectedLine}`)
  // The panel's next message takes the tutor back, on the panel's line, with the thread so far.
  const key = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  await panelThread.reply('もう一度').catch(() => {})
  if (key) process.env.OPENAI_API_KEY = key
  const back = await tool('get_current_moment')
  expect(back.selectedLine === 'パネルの行', `the panel's own line again, not ${back.selectedLine}`)
})

await test('12: a free conversation opened with the cards open to Duet can search them', async () => {
  tutor.open({ kind: 'free', language: 'ja', level: 3, exploreEnabled: true }, panel)
  const found = await tool('search_cards', { query: '表現' })
  expect(found.ok !== false && found.error !== 'EXPLORE_REQUIRED', `search_cards gave ${JSON.stringify(found)}`)
  tutor.open({ kind: 'free', language: 'ja', level: 3 }, panel)
  const closed = await tool('search_cards', { query: '表現' })
  expect(closed.error === 'EXPLORE_REQUIRED', 'without it, the cards stay closed')
})

await test('13: a file that is not a backup is refused in plain words', async () => {
  const { readBackup } = await jiti.import(join(root, 'cards/store.ts'))
  let refused
  try {
    readBackup('this is not JSON {')
  } catch (error) {
    refused = error
  }
  expect(refused?.message === 'That file is not a Duet backup, or it is damaged.', `got ${refused?.message}`)
  expect(readBackup('{"format":"duet-backup"}').format === 'duet-backup', 'JSON is read as it is (checked when restored)')
})

tutor.end(panel)
database().close()
rmSync(folder, { recursive: true, force: true })
if (failures) {
  console.log(`${failures} tutor action test(s) failed.`)
  process.exit(1)
}
console.log('Tutor action tests passed.')
// Deleting a card schedules a purge timer; do not wait for it.
process.exit(0)
