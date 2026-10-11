// Tests talking to Duet: the chat thread both Explain and Talk use (src/main/tutor/thread.ts), and
// Talk in the home base (src/main/talk), with a small fake "electron" module.
// Run: node scripts/test-talk.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-talk-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
const listeners = new Map()
module.exports = { ipcMain: { handle: (channel, work) => { if (handlers.has(channel)) throw new Error('Attempted to register a second handler for ' + channel); handlers.set(channel, work) }, on: (channel, work) => listeners.set(channel, work) }, handlers, listeners }
`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron }, moduleCache: true })
const root = resolve('src/main')
const settle = () => new Promise((done) => setTimeout(done, 0))

// A tutor that answers when told to, and remembers the conversation it was given.
const fakeTutor = () => {
  const pending = []
  const tutor = {
    conversation: undefined,
    asked: [],
    update: (change) => (tutor.conversation = change.conversation),
    reply: (message) => {
      tutor.asked.push({ message, conversation: tutor.conversation })
      return new Promise((resolve, reject) => pending.push({ resolve, reject }))
    },
    answer: (text) => pending.shift().resolve({ text }),
    fail: (message) => pending.shift().reject(new Error(message)),
    claim: () => {}
  }
  return tutor
}

try {
  const { ChatThread } = await jiti.import(join(root, 'tutor/thread.ts'))

  // --- Asking, and asking again after a failure ------------------------------------------------
  const tutor = fakeTutor()
  const states = []
  const thread = new ChatThread(tutor, (state) => states.push(state))
  thread.ask('  hola  ')
  assert.deepEqual(thread.state.chat, [{ from: 'learner', text: 'hola', via: 'text' }])
  assert.equal(thread.state.replying, true)
  assert.deepEqual(tutor.asked[0], { message: 'hola', conversation: [] }, 'the tutor gets the conversation before the message')
  thread.ask('again?')
  assert.equal(tutor.asked.length, 1, 'one message at a time')
  tutor.fail('Offline')
  await settle()
  assert.equal(thread.state.chatError, 'Offline')
  assert.equal(thread.state.replying, false)
  thread.ask('hola')
  assert.equal(thread.state.chat.length, 1, 'Try again sends the same message: asked again, not added twice')
  tutor.answer('¡Hola!')
  await settle()
  assert.deepEqual(thread.state.chat.at(-1), { from: 'duet', text: '¡Hola!', via: 'text' })
  assert.deepEqual(tutor.conversation, thread.state.chat, 'the tutor has the thread for the next message')
  assert.ok(states.length >= 4, 'every change is told')
  thread.ask('   ')
  assert.equal(tutor.asked.length, 2, 'an empty message is not sent')

  // --- Voice turns: kept only when well formed, and bounded ------------------------------------
  thread.addVoiceTurns([
    { from: 'learner', text: ' ¿qué tal? ' },
    { from: 'duet', text: 'Bien.' },
    { from: 'robot', text: 'no' },
    { from: 'duet', text: '   ' },
    { from: 'duet', text: 42 },
    null
  ])
  assert.deepEqual(thread.state.chat.slice(-2), [
    { from: 'learner', text: '¿qué tal?', via: 'voice' },
    { from: 'duet', text: 'Bien.', via: 'voice' }
  ])
  thread.addVoiceTurns('not a list')
  assert.equal(thread.state.chat.length, 4)
  const many = new ChatThread(fakeTutor(), () => {})
  many.addVoiceTurns(Array.from({ length: 500 }, () => ({ from: 'duet', text: 'x'.repeat(10_000) })))
  assert.equal(many.state.chat.length, 200, 'at most 200 turns')
  assert.equal(many.state.chat[0].text.length, 4_000, 'each at most 4,000 characters')

  // --- Starting over drops a reply for the old thread -------------------------------------------
  const late = fakeTutor()
  const fresh = new ChatThread(late, () => {})
  fresh.ask('first line')
  fresh.reset()
  assert.deepEqual(fresh.state, { chat: [] })
  late.answer('about the first line')
  await settle()
  assert.deepEqual(fresh.state.chat, [], 'a reply for an older thread is dropped')
  fresh.ask('second')
  assert.equal(late.asked.length, 2, 'the new thread can ask at once')

  // --- Talk in the home base ---------------------------------------------------------------------
  const electron = await jiti.import(fakeElectron)
  const { Talk } = await jiti.import(join(root, 'talk/index.ts'))
  const homePage = {}
  const sent = []
  const home = { owns: (sender) => sender === homePage, send: (channel, value) => sent.push([channel, value]) }
  const opened = []
  const talking = fakeTutor()
  const tutorStub = {
    open: (context, window) => opened.push({ context, window }),
    // The real one (src/main/tutor) gives the conversation back when another window took it.
    forWindow: () => talking
  }
  const settings = { current: { language: 'ja', level: 3 } }
  const talk = new Talk({ tutor: tutorStub, settings, window: home })
  const call = (channel, sender, ...args) => electron.handlers.get(channel)({ sender }, ...args)
  await assert.rejects(async () => call('talk:open', {}), /not allowed/i, 'only the home page talks here')
  await assert.rejects(async () => call('talk:ask', {}, 'hi'), /not allowed/i)
  assert.deepEqual(await call('talk:open', homePage), { chat: [] })
  assert.equal(opened.length, 1)
  assert.equal(opened[0].window, home, 'the conversation is the home window’s')
  assert.deepEqual(opened[0].context, { kind: 'free', language: 'ja', level: 3, conversation: [], exploreEnabled: true }, 'free, in the language and level, saved cards open to Duet')
  await call('talk:ask', homePage, 'こんにちは')
  assert.equal(talking.asked.at(-1).message, 'こんにちは')
  assert.deepEqual(sent.at(-1), ['talk:state', { chat: [{ from: 'learner', text: 'こんにちは', via: 'text' }], replying: true }], 'the page is told')
  talking.answer('こんにちは！')
  await settle()
  assert.equal(sent.at(-1)[1].chat.at(-1).text, 'こんにちは！')
  await call('talk:voice-turns', homePage, [{ from: 'learner', text: '元気？' }])
  assert.equal((await call('talk:get-state', homePage)).chat.length, 3)
  // Opening Talk again (back to the place) keeps the conversation, in the language now set.
  settings.current.language = 'ko'
  await call('talk:open', homePage)
  assert.equal(opened.at(-1).context.language, 'ko')
  assert.equal(opened.at(-1).context.conversation.length, 3, 'the conversation goes on')
  assert.equal((await call('talk:get-state', homePage)).chat.length, 3)
  // A new conversation starts empty.
  assert.deepEqual(await call('talk:new', homePage), { chat: [] })
  assert.deepEqual(opened.at(-1).context.conversation, [])
  // A free conversation from the strip goes on here: a new thread, with its turns.
  talk.openWithTurns([{ from: 'learner', text: 'やあ' }, { from: 'duet', text: 'やあ！' }])
  assert.deepEqual((await call('talk:get-state', homePage)).chat.map((turn) => turn.text), ['やあ', 'やあ！'])
  assert.deepEqual(sent.at(-1)[1].chat.length, 2, 'the page is told')
  await call('talk:open', homePage)
  assert.equal(opened.at(-1).context.conversation.length, 2, 'and Duet has them when Talk opens')

  // --- Talking from the strip ---------------------------------------------------------------------
  const { StripTalk } = await jiti.import(join(root, 'talk/strip.ts'))
  const stripPage = {}
  const strip = { owns: (sender) => sender === stripPage, send: () => {} }
  const onScreen = { language: 'ja', line: { id: 7, original: '行こう', at: 0, state: 'ready' }, earlier: [], video: { site: 'youtube', url: 'u' }, takenAt: 0 }
  let lineShown = onScreen
  const stripOpened = []
  const ended = []
  const handedOver = []
  const toTalk = []
  const homeOpened = []
  new StripTalk({
    watcher: { moment: () => lineShown },
    settings: { current: { language: 'ja', level: 2 } },
    tutor: { open: (context, window) => stripOpened.push({ context, window }), end: (window) => ended.push(window) },
    explain: { openWithTurns: (moment, turns) => handedOver.push({ moment, turns }) },
    talk: { openWithTurns: (turns) => toTalk.push(turns) },
    openTalk: () => homeOpened.push('talk'),
    window: strip
  })
  await assert.rejects(async () => call('duet:talk', {}), /not allowed/i, 'only the strip starts talking here')
  assert.deepEqual(await call('duet:talk', stripPage), { moment: onScreen, language: 'ja' }, 'the strip is told the line it is about')
  assert.deepEqual(stripOpened.at(-1), { context: { moment: onScreen }, window: strip }, 'the conversation is about the line on screen, and the strip’s')
  // The video moves on; Text chat hands over the line talked about, with the turns so far.
  lineShown = { ...onScreen, line: { ...onScreen.line, id: 8, original: '次の行' } }
  const turns = [{ from: 'learner', text: '行こうって？' }, { from: 'duet', text: '"Let\'s go."' }]
  await call('duet:talk-to-text', stripPage, turns)
  assert.deepEqual(handedOver, [{ moment: onScreen, turns }], 'Explain opens on the line talked about, with the turns')
  await assert.rejects(async () => call('duet:talk-to-text', stripPage, turns), /talk/i, 'handed over once')
  await call('duet:talk', stripPage)
  await call('duet:talk-end', stripPage)
  assert.deepEqual(ended, [strip], 'ending on the strip ends the strip’s conversation')
  // No line on screen (or no video at all): a free conversation, in the language and level.
  lineShown = undefined
  assert.deepEqual(await call('duet:talk', stripPage), { language: 'ja' })
  assert.deepEqual(stripOpened.at(-1).context, { kind: 'free', language: 'ja', level: 2 }, 'free, with no line')
  // Its Text chat goes on in Talk, in the home base, with the turns so far.
  await call('duet:talk-to-text', stripPage, turns)
  assert.deepEqual(toTalk, [turns])
  assert.deepEqual(homeOpened, ['talk'], 'the home base opens on Talk')
  assert.equal(handedOver.length, 1, 'not Explain: there is no line')

  // --- Explain, handed the turns -------------------------------------------------------------------
  const { Explain } = await jiti.import(join(root, 'explain/index.ts'))
  const panelPage = {}
  const panelSent = []
  const panel = { owns: (sender) => sender === panelPage, send: (channel, value) => panelSent.push([channel, value]), show: () => {}, on: () => {} }
  const explainTutor = fakeTutor()
  const explain = new Explain({
    panel,
    replay: () => {},
    tutor: { open: () => {}, end: () => {}, update: () => {}, forWindow: () => explainTutor },
    hear: async () => ({ note: { heard: false } }),
    explainer: { explain: async () => ({ meaning: 'Let’s go.' }) }
  })
  explain.openWithTurns(onScreen, turns)
  await settle()
  await settle()
  const shown = await electron.handlers.get('explain:get-state')({ sender: panelPage })
  assert.equal(shown.explanation?.meaning, 'Let’s go.', 'the line is explained as usual')
  assert.deepEqual(shown.chat.map((turn) => turn.text), ['行こうって？', '"Let\'s go."'], 'and the strip’s turns are in the thread, kept through the explaining')
  assert.equal(shown.chat[0].via, 'voice')

  // Try again after a failed explanation asks for it again and keeps the conversation (the strip's
  // turns, here); an error that can't be fixed by asking again offers no Try again.
  electron.handlers.clear()
  electron.listeners.clear()
  let explainTries = 0
  const flaky = new Explain({
    panel,
    replay: () => {},
    tutor: { open: () => {}, end: () => {}, update: () => {}, forWindow: () => fakeTutor() },
    hear: async () => ({ note: { heard: false } }),
    explainer: { explain: async () => (++explainTries === 1 ? Promise.reject(new Error('down')) : { meaning: 'Let’s go.' }) }
  })
  flaky.openWithTurns(onScreen, turns)
  await settle()
  await settle()
  let now = await electron.handlers.get('explain:get-state')({ sender: panelPage })
  assert.ok(now.error && now.retryable !== false, 'a failed explanation can be asked for again')
  electron.listeners.get('explain:retry')({ sender: panelPage })
  await settle()
  await settle()
  now = await electron.handlers.get('explain:get-state')({ sender: panelPage })
  assert.equal(now.explanation?.meaning, 'Let’s go.', 'asked again: explained')
  assert.equal(now.chat.length, 2, 'Try again keeps the conversation')
  electron.handlers.clear()
  electron.listeners.clear()
  const keyless = new Explain({ panel, replay: () => {}, tutor: { open: () => {}, end: () => {}, update: () => {}, forWindow: () => fakeTutor() }, hear: async () => ({ note: { heard: false } }) })
  keyless.open(onScreen)
  now = await electron.handlers.get('explain:get-state')({ sender: panelPage })
  assert.equal(now.retryable, false, 'no API key: asking again won’t help, so no Try again')

  // Voice greets by what the conversation is about: a line, or nothing in particular.
  const { voiceGreeting } = await jiti.import(resolve('src/renderer/src/explain/voice/prompts.ts'))
  assert.match(voiceGreeting('line').instructions, /the line/)
  assert.doesNotMatch(voiceGreeting('free').instructions, /\bline\b/, 'a free conversation is not about a line')
  assert.match(voiceGreeting('free').instructions, /free conversation/)

  console.log('Talk tests passed.')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  rmSync(folder, { recursive: true, force: true })
}
