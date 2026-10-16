// Tests the flashcards page (docs/design/cards/flashcards-page.md): its pure decisions
// (src/shared/flashcards.ts: the kind of card, the rating from Forgot or Got it, the line split around
// its word, when a card comes back), the main process side (src/main/flashcards) and the card backs'
// dictionary (src/main/dictionary: what it reuses, when it asks the AI and how few requests it makes),
// on a temporary database with a fake "electron" module and fake AI, voice and quiz models. Also the
// Wiktionary reader (src/main/dictionary/wiktionary.ts) the dictionary packs are built with.
// Run: node scripts/test-flashcards.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-flashcards-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  ipcMain: { handle: (channel, work) => { if (handlers.has(channel)) throw new Error('Attempted to register a second handler for ' + channel); handlers.set(channel, work) }, on: () => {} },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  dialog: {},
  nativeImage: {},
  desktopCapturer: {},
  is: { dev: false },
  handlers
}
`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const shared = await jiti.import(resolve('src/shared/flashcards.ts'))
const { parseEntry, entryUrl } = await jiti.import(resolve('src/main/dictionary/wiktionary.ts'))
const { stepOf, chooseKind, inferRating, comesBack, splitLine, sameWord, orderTips } = shared

let failures = 0
async function test(name, work) {
  try {
    await work()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}\n${error.stack}`)
  }
}

// —— Pure decisions ——

await test('a word’s rung reads as its step', () => {
  assert.equal(stepOf('encountered'), 'heard')
  assert.equal(stepOf('unknown'), 'heard', 'a word with a card has been met')
  assert.equal(stepOf('known'), 'known')
  assert.equal(stepOf('speakable'), 'say')
  assert.equal(stepOf('usable'), 'use')
  assert.equal(stepOf('ignored'), 'heard')
  assert.equal(stepOf(undefined), 'heard')
})

await test('the kind of card follows the step and what Duet has', () => {
  const heard = { step: 'heard', line: true, gap: true, voice: true, picture: false, turn: 0 }
  assert.equal(chooseKind(heard), 'sentence')
  assert.equal(chooseKind({ ...heard, line: false, gap: false }), 'word', 'no line: a word card')
  assert.equal(
    chooseKind({ ...heard, turn: 2 }),
    'listening',
    'every third time, with a voice: listening'
  )
  assert.equal(
    chooseKind({ ...heard, turn: 2, voice: false }),
    'sentence',
    'no voice: no listening card'
  )
  assert.equal(chooseKind({ ...heard, turn: 2, picture: true }), 'picture')
  assert.equal(
    chooseKind({ ...heard, line: false, picture: true }),
    'picture',
    'a picture and no line'
  )
  assert.equal(chooseKind({ ...heard, step: 'known' }), 'gap')
  assert.equal(
    chooseKind({ ...heard, step: 'known', gap: false }),
    'word',
    'the word not found in its line: no gap'
  )
  assert.equal(chooseKind({ ...heard, step: 'say' }), 'use')
  assert.equal(chooseKind({ ...heard, step: 'use' }), 'fresh')
})

await test('Forgot or Got it becomes a rating from how it went', () => {
  const learnt = { state: 'review' }
  assert.equal(inferRating({ got: false, revealMs: 1000, replays: 0 }, learnt), 'again')
  assert.equal(inferRating({ got: true, revealMs: 5000, replays: 0 }, learnt), 'good')
  assert.equal(
    inferRating({ got: true, revealMs: 2000, replays: 0 }, learnt),
    'easy',
    'at once, on a learnt card'
  )
  assert.equal(
    inferRating({ got: true, revealMs: 2000, replays: 0 }, { state: 'new' }),
    'good',
    'never easy the first time'
  )
  assert.equal(inferRating({ got: true, revealMs: 20_000, replays: 0 }, learnt), 'hard', 'slow')
  assert.equal(
    inferRating({ got: true, revealMs: 2000, replays: 2 }, learnt),
    'hard',
    'replayed twice'
  )
  assert.equal(
    inferRating({ got: true, revealMs: 2000, replays: 0, spoken: 'poor' }, learnt),
    'hard',
    'said poorly'
  )
  assert.equal(
    inferRating({ got: true, revealMs: 6000, replays: 0, spoken: 'good' }, learnt),
    'easy',
    'a spoken answer has longer'
  )
})

await test('when a card comes back, in plain words', () => {
  const now = Date.UTC(2026, 9, 16, 12)
  const min = 60_000
  const day = 1440 * min
  assert.equal(comesBack(now + 30_000, now), 'in a minute')
  assert.equal(comesBack(now + 10 * min, now), 'in 10 minutes')
  assert.equal(comesBack(now + 5 * 60 * min, now), 'later today')
  assert.equal(comesBack(now + day, now), 'tomorrow')
  assert.equal(comesBack(now + 4 * day, now), 'in 4 days')
  assert.equal(comesBack(now + 32 * day, now), 'in a month')
  assert.equal(comesBack(now + 70 * day, now), 'in 2 months')
  assert.equal(comesBack(now + 365 * day, now), 'in a year')
})

await test('a line splits around its word, or a form of it', () => {
  const line = 'Mañana tengo que madrugar.'
  assert.deepEqual(splitLine(line, ['madrugar']), {
    before: 'Mañana tengo que ',
    word: 'madrugar',
    after: '.',
    found: true
  })
  assert.equal(
    splitLine('Ayer madrugué mucho.', ['madrugar']).word,
    'madrugué',
    'a changed form, by its stem'
  )
  assert.equal(
    splitLine('Calienta el aceite en la Sartén.', ['sartén']).word,
    'Sartén',
    'any case, kept as written'
  )
  assert.equal(splitLine('La casa es casamentera', ['casa']).word, 'casa', 'whole words only')
  assert.equal(
    splitLine('明日は早く起きる', ['起きる']).word,
    '起きる',
    'no spaces: found anywhere'
  )
  const missing = splitLine('Nada que ver.', ['madrugar'])
  assert.equal(missing.found, false)
  assert.equal(missing.before, 'Nada que ver.')
})

await test('a typed answer matches the word, ignoring case and stops, not missing accents', () => {
  assert.ok(sameWord('Sartén', ['sartén']))
  assert.ok(sameWord(' sartén. ', ['sartén']))
  assert.ok(!sameWord('sarten', ['sartén']), 'an accent missing is a different spelling')
  assert.ok(!sameWord('', ['sartén']))
  assert.ok(sameWord('madrugué', ['madrugué', 'madrugar']), 'any of the forms')
})

await test('tips come in their order, without repeats or empty ones', () => {
  const tips = orderTips([
    { label: 'Related', text: 'madrugada' },
    { label: 'Tip', text: 'Most often heard as tengo que madrugar.' },
    { label: 'Careful', text: 'It’s la sartén.' },
    { label: 'Tip', text: 'most often heard as tengo que madrugar.' },
    { label: 'Note', text: '  ' }
  ])
  assert.deepEqual(
    tips.map((tip) => tip.label),
    ['Careful', 'Tip', 'Related']
  )
})

// —— Wiktionary's data ——

const KAIKKI = {
  madrugar: [
    {
      word: 'madrugar',
      pos: 'verb',
      senses: [{ glosses: ['to get up early'] }, { glosses: ['to be ahead of others'] }],
      sounds: [{ ipa: '[ma.ð̞ɾuˈɣ̞aɾ]' }, { ipa: '/madɾuˈɡaɾ/' }],
      hyphenations: [{ parts: ['ma', 'dru', 'gar'] }],
      derived: [
        { word: 'madrugador', english: 'early riser' },
        { word: 'a quien madruga Dios le ayuda siempre', english: 'a saying' }
      ],
      related: [{ word: 'madrugada' }]
    },
    {
      word: 'madrugar',
      pos: 'verb',
      senses: [
        { glosses: ['inflection of madrugar'], tags: ['form-of'], form_of: [{ word: 'madrugar' }] }
      ]
    }
  ],
  sartén: [
    {
      word: 'sartén',
      pos: 'noun',
      head_templates: [{ expansion: 'sartén f (plural sartenes)' }],
      senses: [{ glosses: ['frying pan'] }],
      sounds: [{ ipa: '/saɾˈten/' }],
      hyphenations: [{ parts: ['sar‧tén'] }]
    }
  ],
  mar: [
    {
      word: 'mar',
      pos: 'noun',
      head_templates: [{ expansion: 'mar m or f (plural mares)' }],
      senses: [{ glosses: ['sea'] }]
    }
  ]
}
const jsonl = (word) => KAIKKI[word].map((entry) => JSON.stringify(entry)).join('\n')

await test('the Wiktionary reader reads an entry from its data', () => {
  const entry = parseEntry('es', 'madrugar', `${jsonl('madrugar')}\nnot json\n`)
  assert.equal(entry.ipa, '/madɾuˈɡaɾ/', 'the broad transcription')
  assert.equal(entry.syllables, 'ma·dru·gar')
  assert.equal(entry.pos, 'verb')
  assert.deepEqual(
    entry.senses,
    ['to get up early', 'to be ahead of others'],
    'form-of senses left out'
  )
  assert.deepEqual(
    entry.related,
    ['madrugador, early riser', 'madrugada'],
    'sayings are not related words'
  )
  const pan = parseEntry('es', 'sartén', jsonl('sartén'))
  assert.equal(pan.gender, 'feminine')
  assert.equal(pan.article, 'la')
  assert.equal(pan.syllables, 'sar·tén', 'Wiktionary’s hyphenation dot becomes the middle dot')
  const sea = parseEntry('es', 'mar', jsonl('mar'))
  assert.equal(sea.gender, 'masculine or feminine')
  assert.equal(sea.article, undefined, 'either article: none shown')
  assert.equal(parseEntry('es', 'otra', jsonl('mar')), undefined, 'no entry for the word')
  assert.equal(
    entryUrl('Spanish', 'sartén'),
    'https://kaikki.org/dictionary/Spanish/meaning/s/sa/sart%C3%A9n.jsonl'
  )
  assert.equal(
    entryUrl('Japanese', '行く'),
    `https://kaikki.org/dictionary/Japanese/meaning/${encodeURIComponent('行')}/${encodeURIComponent('行く')}/${encodeURIComponent('行く')}.jsonl`
  )
})

// —— The main process side ——

const electron = await jiti.import(fakeElectron)
const root = resolve('src/main')
const { Cards } = await jiti.import(join(root, 'cards/index.ts'))
const { Knowledge } = await jiti.import(join(root, 'knowledge/index.ts'))
const { Dictionary } = await jiti.import(join(root, 'dictionary/index.ts'))
const { Flashcards } = await jiti.import(join(root, 'flashcards/index.ts'))
const { database } = await jiti.import(join(root, 'store/db.ts'))

// The AI's entries, as src/main/ai/entries returns them; a word it doesn't know comes back empty.
const ENTRIES = {
  madrugar: {
    base: 'madrugar',
    syllables: 'ma·dru·gar',
    ipa: '/madɾuˈɡaɾ/',
    pos: 'Verb',
    gender: '',
    senses: ['to get up early', 'to be ahead of others'],
    related: ['madrugada, the small hours', 'madrugador, an early riser'],
    example: { line: 'Mañana tengo que madrugar.', translation: 'Tomorrow I have to get up early.' }
  },
  sartén: {
    base: 'sartén',
    syllables: 'sar·tén',
    ipa: '/saɾˈten/',
    pos: 'noun',
    gender: 'feminine',
    senses: ['frying pan'],
    related: [],
    example: { line: 'Calienta la sartén.', translation: 'Heat the pan.' }
  },
  cebolla: {
    base: 'cebolla',
    syllables: 'ce·bo·lla',
    ipa: '/θeˈβo.ʎa/',
    pos: 'noun',
    gender: 'feminine',
    senses: ['onion'],
    related: [],
    example: { line: '', translation: '' }
  },
  madrugué: {
    base: 'madrugar',
    syllables: 'ma·dru·gar',
    ipa: '/madɾuˈɡaɾ/',
    pos: 'verb',
    gender: '',
    senses: ['to get up early'],
    related: [],
    example: { line: '', translation: '' }
  }
}
// Each request: the words asked about together, with their hints.
const requests = []
let failNext = false
const writer = {
  lookUp: async (language, words) => {
    requests.push(words)
    if (failNext) {
      failNext = false
      throw new Error('offline')
    }
    return words.map((item) =>
      ENTRIES[item.word] ? { word: item.word, ...ENTRIES[item.word] } : undefined
    )
  }
}
const asked = (word) => requests.flat().filter((item) => item.word === word).length
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
const dictionary = new Dictionary(writer)
const spoken = []
const replayed = []
const home = { id: 'home' }
const strip = { id: 'strip' }
const cards = new Cards({ replay: () => {}, practise: () => {}, open: () => {} })
const knowledge = new Knowledge()
new Flashcards({
  cards,
  knowledge,
  dictionary,
  owns: (sender) => sender === home,
  window: () => null,
  replay: (moment) => replayed.push(moment),
  currentVideo: () => undefined,
  voice: {
    tts: {
      name: 'fake',
      speak: async (said) => (
        spoken.push(said),
        { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/mpeg' }
      )
    },
    coach: {
      name: 'fake',
      coach: async () => ({
        heard: 'madrugar',
        note: 'Clear, with the stress at the end.',
        good: true
      })
    },
    stt: { name: 'fake', transcribe: async () => ({ text: 'Mañana voy a madrugar.' }) }
  },
  quiz: {
    use: async (line, sentence, words) => ({
      note: 'Nicely used.',
      words: words.map((word) => ({ word, used: true, correct: true }))
    })
  }
})
// Async, as IPC is: a handler that throws is a rejected promise.
const ask = async (channel, ...args) =>
  electron.handlers.get(`flashcards:${channel}`)({ sender: home }, ...args)

// A video watched, with a line where madrugar was heard, and the word on the ladder.
const now = Date.now()
const db = database()
db.prepare(
  'INSERT INTO videos (id, site, url, title, language, first_watched, last_watched) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(
  'youtube:abc',
  'youtube',
  'https://youtu.be/abc',
  'Un día en Madrid',
  'es',
  now - 3600_000,
  now - 3600_000
)
const processed = {
  translation: 'Tomorrow I have to get up early.',
  source: [
    { text: 'Mañana', job: 'a', pair: 0, space: true },
    { text: 'tengo', job: 'v', pair: 1, space: true, base: 'tener' },
    { text: 'que', job: 'g', pair: 2, space: true },
    { text: 'madrugar', job: 'v', pair: 3, space: false, base: 'madrugar' },
    { text: '.', job: 'g', pair: null, space: false }
  ],
  english: [
    { text: 'Tomorrow', job: 'a', pair: 0, space: true },
    { text: 'I', job: 'p', pair: null, space: true },
    { text: 'have to', job: 'v', pair: 1, space: true },
    { text: 'get up early', job: 'v', pair: 3, space: false }
  ]
}
db.prepare(
  'INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(
  'youtube:abc',
  'es',
  85,
  'Mañana tengo que madrugar.',
  'Tomorrow I have to get up early.',
  JSON.stringify(processed),
  now - 3000_000
)
knowledge.noteSeen('es', processed, now - 3000_000)
knowledge.noteSeen('es', processed, now - 2000_000)
const moment = {
  language: 'es',
  line: {
    id: 1,
    original: 'Mañana tengo que madrugar.',
    at: now,
    start: 85,
    state: 'ready',
    processed
  },
  earlier: [],
  video: {
    site: 'youtube',
    url: 'https://youtu.be/abc',
    title: 'Un día en Madrid',
    id: 'abc',
    position: 85
  },
  takenAt: now
}
const fromVideo = cards.saveDraft({
  type: 'understand',
  expression: 'madrugar',
  meaning: 'to get up early',
  target: 'madrugar',
  language: 'es',
  source: { kind: 'video', moment },
  wordKey: 'es:madrugar',
  explanation: {
    meaning: '',
    notice: { text: 'Most often heard as tengo que madrugar.' },
    card: { expression: '', meaning: '', target: '', situation: '' },
    model: 'x',
    version: 1
  }
}).saved

await test('only the home window may ask', async () => {
  await assert.rejects(
    async () => electron.handlers.get('flashcards:today')({ sender: strip }, 'es'),
    /main window/
  )
  await assert.rejects(() => ask('today', 'xx'), /isn’t one Duet teaches/)
})

await test('the page’s choices are kept, and only real kinds of card', async () => {
  assert.deepEqual(await ask('prefs'), { guideSeen: false, kindsSeen: [] })
  await ask('set-prefs', { guideSeen: true, kindsSeen: ['gap', 'gap', 'nonsense', 'sentence'] })
  assert.deepEqual(await ask('prefs'), { guideSeen: true, kindsSeen: ['gap', 'sentence'] })
  await ask('set-prefs', { kindsSeen: [] })
  assert.equal((await ask('prefs')).guideSeen, true, 'a change keeps what it doesn’t name')
})

await test('a card saved anywhere gets its entry ahead, with how it was met as the hint', async () => {
  await settle()
  assert.equal(asked('madrugar'), 1)
  assert.deepEqual(requests[0], [
    { word: 'madrugar', line: 'Mañana tengo que madrugar.', meaning: 'to get up early' }
  ])
})

let made
await test('Make a card: the lookup fills it in, and Keep reuses it with no second request', async () => {
  const looked = await ask('lookup', 'es', 'sartén')
  assert.equal(looked.meaning, 'frying pan')
  assert.equal(looked.entry.article, 'la', 'the article from the gender')
  const before = requests.length
  made = await ask('make', { language: 'es', word: 'sartén', line: '' })
  await settle()
  assert.equal(requests.length, before, 'the lookup’s entry is reused, saving included')
  assert.equal(made.meaning, 'frying pan', 'from the dictionary')
  assert.deepEqual(
    made.example,
    { line: 'Calienta la sartén.', byDuet: true },
    'the entry’s example: no extra request'
  )
  assert.equal(made.wordKey, 'es:sartén')
  const form = await ask('make', {
    language: 'es',
    word: 'madrugué',
    meaning: 'got up early',
    line: 'Ayer madrugué.'
  })
  assert.equal(form.wordKey, 'es:madrugar', 'a form typed is kept under its dictionary form')
  // Gone again, so the tests after this see the cards they expect.
  cards.collection.remove(form.id)
  const own = await ask('make', {
    language: 'es',
    word: 'cebolla',
    meaning: 'onion',
    line: 'Pica la cebolla.'
  })
  assert.deepEqual(own.example, { line: 'Pica la cebolla.', byDuet: false })
  await assert.rejects(
    () => ask('make', { language: 'es', word: 'zzz', line: '' }),
    /Write what it means/,
    'no meaning, none found'
  )
  assert.equal(dictionary.cached('es', 'zzz'), null, 'remembered as missing')
})

await test('Today counts the cards waiting, the words up today and the ladder', async () => {
  const today = await ask('today', 'es')
  assert.deepEqual(today.counts, { new: 3, learning: 0, review: 0 })
  assert.equal(today.total, 3)
  assert.deepEqual(
    today.upToday.map((item) => item.word),
    ['madrugar', 'sartén', 'cebolla']
  )
  assert.equal(today.ladder.heard >= 1, true)
})

await test('a card’s view: its kind, entry, the line it was last heard in, and tips', async () => {
  const before = requests.length
  const state = await ask('start', { kind: 'today' })
  assert.equal(requests.length, before, 'every card’s entry was fetched ahead: no request now')
  assert.equal(state.total, 3)
  assert.equal(state.done, 0)
  const view = state.next
  assert.equal(view.card.id, fromVideo.id, 'the oldest new card first')
  assert.equal(view.kind, 'sentence')
  assert.equal(view.step, 'heard')
  assert.equal(view.word, 'madrugar')
  assert.equal(view.entry.ipa, '/madɾuˈɡaɾ/')
  assert.equal(view.entry.syllables, 'ma·dru·gar')
  assert.deepEqual(view.lastHeard, {
    line: 'Mañana tengo que madrugar.',
    translation: 'Tomorrow I have to get up early.',
    video: 'Un día en Madrid',
    at: 85,
    replayable: true
  })
  assert.equal(view.heardTimes, 2)
  assert.equal(view.line.word, 'madrugar')
  assert.deepEqual(
    view.tips.map((tip) => tip.label),
    ['Tip', 'Other meanings', 'Related']
  )
})

await test('Got it rates the card, says when it comes back, and Undo takes it back', async () => {
  const state = await ask('answer', fromVideo.id, { got: true, revealMs: 4000, replays: 0 })
  assert.equal(state.done, 1)
  assert.equal(state.answered.word, 'madrugar')
  assert.match(state.answered.comesBack, /minute|minutes|later today/, 'a new card comes back soon')
  assert.equal(state.canUndo, true)
  assert.notEqual(cards.collection.get(fromVideo.id).state, 'new')
  assert.equal(state.next.card.id, made.id)
  const back = await ask('undo')
  assert.equal(back.done, 0)
  assert.equal(back.next.card.id, fromVideo.id, 'the card answered last is shown again')
  assert.equal(cards.collection.get(fromVideo.id).state, 'new', 'its rating is taken back')
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM reviews WHERE undone_at IS NOT NULL').get().n,
    1,
    'undo marks the review, never deletes it'
  )
})

await test('an answer for a card no longer on screen is refused', async () => {
  await assert.rejects(
    () => ask('answer', made.id, { got: true, revealMs: 1000, replays: 0 }),
    /no longer the one on screen/
  )
})

await test('Forgot brings it back in a minute; the session ends with nothing left', async () => {
  let state = await ask('answer', fromVideo.id, { got: false, revealMs: 4000, replays: 0 })
  assert.equal(state.answered.comesBack, 'in a minute')
  while (state.next && state.next.card.id !== fromVideo.id)
    state = await ask('answer', state.next.card.id, { got: true, revealMs: 3000, replays: 0 })
  assert.equal(state.next, undefined, 'nothing more due now: the forgotten card waits its minute')
  assert.equal(state.done, 3)
})

await test('one video’s review has only its cards', async () => {
  // Due again now, so the video's card can be reviewed.
  db.prepare('UPDATE cards SET due = ? WHERE id = ?').run(Date.now() - 1000, fromVideo.id)
  const state = await ask('start', { kind: 'video', video: 'youtube:abc' })
  assert.equal(state.next.card.id, fromVideo.id)
  assert.equal(state.total, 1)
})

await test('Practise now reschedules nothing', async () => {
  const before = cards.collection.get(fromVideo.id)
  let state = await ask('start', { kind: 'practise', key: 'es:madrugar' })
  assert.equal(state.total, 1)
  state = await ask('answer', fromVideo.id, { got: false, revealMs: 1000, replays: 0 })
  assert.equal(state.answered.comesBack, undefined, 'off schedule: no return time')
  const after = cards.collection.get(fromVideo.id)
  assert.equal(after.due, before.due)
  assert.equal(after.reps, before.reps)
  state = await ask('undo')
  assert.equal(state.next.card.id, fromVideo.id, 'Undo goes back here too')
})

await test('Duet reads the word and the line, asking once for each', async () => {
  const clip = await ask('speak', fromVideo.id, 'line')
  assert.deepEqual([...clip.data], [1, 2, 3])
  await ask('speak', fromVideo.id, 'line')
  await ask('speak', fromVideo.id, 'word')
  assert.deepEqual(spoken, ['Mañana tengo que madrugar.', 'madrugar'])
})

const evidence = (kind) =>
  db
    .prepare(
      "SELECT good, context FROM word_evidence WHERE key = 'es:madrugar' AND kind = ? ORDER BY id"
    )
    .all(kind)
await test('a gap card typed counts as recall; said, as saying it', async () => {
  assert.equal((await ask('check-typed', fromVideo.id, 'Madrugar')).good, true)
  assert.equal((await ask('check-typed', fromVideo.id, 'levantarse')).note, 'It’s madrugar.')
  assert.deepEqual(
    evidence('recall').map((row) => row.good),
    [1, 0]
  )
  const said = await ask('check-spoken', fromVideo.id, {
    data: new Uint8Array([1]),
    mimeType: 'audio/wav'
  })
  assert.deepEqual(said, {
    heard: 'madrugar',
    note: 'Clear, with the stress at the end.',
    good: true
  })
  assert.deepEqual(
    evidence('say').map((row) => row.good),
    [1]
  )
  await assert.rejects(
    () => ask('check-spoken', fromVideo.id, { data: 'nope' }),
    /recording could not be used/
  )
})

await test('a use-it card: the learner’s own sentence counts toward You can use it', async () => {
  const typed = await ask('check-use', fromVideo.id, 'Los lunes tengo que madrugar.')
  assert.equal(typed.good, true)
  assert.equal(typed.note, 'Nicely used.')
  const said = await ask('check-use', fromVideo.id, {
    data: new Uint8Array([1]),
    mimeType: 'audio/wav'
  })
  assert.equal(said.heard, 'Mañana voy a madrugar.')
  assert.deepEqual(
    evidence('use').map((row) => row.context),
    ['Los lunes tengo que madrugar.', 'Mañana voy a madrugar.']
  )
  assert.equal(evidence('say').length, 2, 'said out loud counts as saying it too')
})

await test('a word in Words: its entry, where it stands, and the place to play it again', async () => {
  const word = await ask('word', 'es', 'es:madrugar')
  assert.equal(word.word, 'madrugar')
  assert.equal(word.entry.pos, 'verb', 'kept lower case')
  assert.equal(word.cards.length, 1)
  assert.equal(typeof word.nextReview, 'number')
  assert.equal(word.sooner, false)
  assert.deepEqual(word.picture, {
    cardId: fromVideo.id,
    state: 'unset',
    url: undefined,
    fromVideo: true
  })
  assert.equal(await ask('replay', 'es', 'es:madrugar'), true)
  assert.equal(replayed.at(-1).video.id, 'abc')
  assert.equal(replayed.at(-1).line.start, 85)
  assert.equal(await ask('replay', 'es', 'es:sartén'), false, 'not heard in a video yet')
})

await test('Recall sooner brings a card in and never counts as forgetting', async () => {
  const later = Date.now() + 8 * 86_400_000
  db.prepare("UPDATE cards SET due = ?, fsrs = json_set(fsrs, '$.due', ?) WHERE id = ?").run(
    later,
    new Date(later).toISOString(),
    fromVideo.id
  )
  const before = cards.collection.get(fromVideo.id)
  const word = await ask('sooner', 'es', 'es:madrugar', true)
  assert.equal(word.sooner, true)
  const after = cards.collection.get(fromVideo.id)
  assert.ok(after.due < later - 3 * 86_400_000, 'about halfway closer')
  assert.equal(after.lapses, before.lapses, 'no lapse')
  assert.equal(after.revision, before.revision + 1, 'outcomes shown before no longer apply')
  await ask('sooner', 'es', 'es:madrugar', true)
  assert.equal(cards.collection.get(fromVideo.id).due, after.due, 'on twice: brought in once')
  assert.equal((await ask('sooner', 'es', 'es:madrugar', false)).sooner, false)
})

await test('Pause leaves a word’s cards out of review', async () => {
  db.prepare('UPDATE cards SET due = ? WHERE id = ?').run(Date.now() - 1000, fromVideo.id)
  assert.equal((await ask('pause', 'es', 'es:madrugar', true)).paused, true)
  const state = await ask('start', { kind: 'video', video: 'youtube:abc' })
  assert.equal(state.next, undefined)
  assert.equal((await ask('pause', 'es', 'es:madrugar', false)).paused, false)
})

await test('Collections: the piles, and By video', async () => {
  const piles = await ask('collections')
  assert.deepEqual(
    piles.map((pile) => [pile.name, pile.cards]),
    [
      ['From your videos', 1],
      ['Made by you', 2]
    ]
  )
  assert.equal(piles[0].top.word, 'madrugar')
  const videos = await ask('videos', 'es')
  assert.equal(videos.length, 1)
  assert.equal(videos[0].title, 'Un día en Madrid')
  assert.deepEqual(
    videos[0].words.map((item) => item.word),
    ['madrugar']
  )
  assert.equal(videos[0].line, 'Mañana tengo que madrugar.')
})

await test('a card made by hand fills itself in once its word is heard', async () => {
  const before = (await ask('word', 'es', 'es:sartén')).lastHeard
  assert.equal(before, undefined)
  const pan = {
    translation: 'Heat the oil in the frying pan.',
    source: [
      { text: 'Calienta', job: 'v', pair: 0, space: true },
      { text: 'la', job: 'g', pair: 1, space: true },
      { text: 'sartén', job: 'n', pair: 2, space: false, base: 'sartén' }
    ],
    english: []
  }
  db.prepare(
    'INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'youtube:abc',
    'es',
    124,
    'Calienta la sartén',
    pan.translation,
    JSON.stringify(pan),
    Date.now()
  )
  const after = await ask('word', 'es', 'es:sartén')
  assert.equal(after.lastHeard.video, 'Un día en Madrid')
  assert.equal(after.lastHeard.at, 124)
  assert.equal(after.line.word, 'sartén')
})

await test('the dictionary asks once per word, and never for a word without a card', async () => {
  const before = requests.length
  await dictionary.entry('es', { word: 'madrugar' })
  await dictionary.entry('es', { word: 'zzz' })
  assert.equal(requests.length, before, 'kept, and kept as missing')
  assert.equal(asked('madrugar'), 1)
  // A word met but with no card: its back is what Duet knows, with no request.
  knowledge.noteSeen('es', {
    ...processed,
    source: processed.source.map((token) =>
      token.base === 'tener' ? { ...token, base: 'tener' } : token
    )
  })
  const plain = await ask('word', 'es', 'es:tener')
  assert.equal(requests.length, before, 'no request for a word without a card')
  assert.equal(plain.entry.pos, 'verb', 'its job in the line')
  assert.deepEqual(plain.entry.senses, ['have to'], 'its English in the line')
})

await test('Add to review: a heard word becomes a card at once, from the line, with no lookup', async () => {
  const before = requests.length
  const kept = await ask('keep', 'es', 'es:tener')
  // Saving starts the background fill every saved card gets (one request), which nothing waits for.
  assert.ok(requests.length - before <= 1, 'no lookup of its own')
  assert.equal(kept.cards.length, 1, 'the word has its card')
  const card = kept.cards[0]
  assert.equal(card.meaning, 'have to', 'its meaning in the line')
  assert.deepEqual(card.example, { line: 'Mañana tengo que madrugar.', byDuet: false }, 'the line it was heard in')
  assert.equal(card.wordKey, 'es:tener')
  const again = await ask('keep', 'es', 'es:tener')
  assert.equal(again.cards.length, 1, 'a second click makes no second card')
  assert.equal(await ask('keep', 'es', 'es:zzz'), undefined, 'no meaning known: the page opens Make a card')
  // Gone again, so the tests after this see the cards they expect.
  cards.collection.remove(card.id)
  await settle()
})

await test('many words go in few requests; a running request is waited for, a failed one asked again', async () => {
  const words = Array.from({ length: 15 }, (_, index) => ({ word: `palabra${index}` }))
  const before = requests.length
  dictionary.prefetch('es', words)
  dictionary.prefetch('es', words)
  const one = dictionary.entry('es', { word: 'palabra3' })
  await settle()
  await one
  assert.equal(
    requests.length - before,
    2,
    '15 words in two requests (12 at most each), nothing twice'
  )
  failNext = true
  assert.equal(await dictionary.entry('es', { word: 'cansado' }), undefined)
  assert.equal(dictionary.cached('es', 'cansado'), undefined, 'a failure isn’t kept')
  await dictionary.entry('es', { word: 'cansado' })
  assert.equal(asked('cansado'), 2, 'so it’s asked again')
})

await test('without the AI, nothing is asked and backs show what Duet knows', async () => {
  const offline = new Dictionary()
  assert.equal(offline.available, false)
  assert.equal(await offline.entry('es', { word: 'nuevo' }), undefined)
  offline.prefetch('es', [{ word: 'nuevo' }])
  assert.equal(offline.cached('es', 'nuevo'), undefined)
})

await test('a picture: none is remembered as the learner’s choice', async () => {
  assert.equal(await ask('picture', made.id, 'none'), undefined)
  assert.equal((await ask('word', 'es', 'es:sartén')).picture.state, 'none')
  await assert.rejects(() => ask('picture', made.id, 'capture'), /isn’t from a video/)
  await assert.rejects(() => ask('picture', fromVideo.id, 'capture'), /Open the video/)
  await assert.rejects(() => ask('picture', made.id, 'paint'), /isn’t a way/)
})

// Windows keeps the database file open until the process ends.
try {
  rmSync(folder, { recursive: true, force: true })
} catch {
  // Left for the system to clear.
}
// How cards work's sample (src/renderer/src/home/flashcards/sample.ts): a whole review and a word's
// page run in memory, with no window.duet (so nothing reaches the database, the scheduler or the
// knowledge store), and every sample card is one the page can show.
await test('the tour’s sample never reaches the app’s data', async () => {
  assert.equal(globalThis.window, undefined)
  const sample = await jiti.import(resolve('src/renderer/src/home/flashcards/sample.ts'))
  const api = sample.sampleApi()
  let state = await api.start({ kind: 'today' })
  assert.equal(state.total, sample.sampleToday().total)
  const kinds = new Set()
  while (state.next) {
    kinds.add(state.next.kind)
    assert.ok(state.next.card.id.startsWith('sample-'))
    if (state.next.kind === 'gap') assert.equal((await api.checkTyped(state.next.card.id, 'sartén')).good, true)
    state = await api.answer(state.next.card.id, { got: true, revealMs: 2000, replays: 0 })
  }
  assert.equal(state.done, state.total)
  assert.deepEqual([...kinds].sort(), ['fresh', 'gap', 'sentence', 'word'])
  state = await api.undo()
  assert.ok(state.next)
  const word = await api.setSooner('es', sample.SAMPLE_WORD, true)
  assert.equal(word.sooner, true)
  assert.equal((await api.word('es', sample.SAMPLE_WORD)).word, 'madrugar')
  // A fresh sample starts clean: nothing from the last tour carries over.
  assert.equal((await sample.sampleApi().word('es', sample.SAMPLE_WORD)).sooner, false)
  const words = sample.sampleWords()
  assert.equal(words.cards.length, words.summary.words.length)
})

if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall flashcards tests passed')
