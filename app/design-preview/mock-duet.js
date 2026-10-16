// A stand-in for the Electron preload bridge (window.duet), so the home window renders in a plain
// browser for design work. Fake data only; actions do nothing.
const day = 86400000
const now = Date.now()
const settings = {
  language: 'es', level: 2, guessFirst: true, waitForTranslation: true, pauseForHelp: true,
  onboarded: true, shortcut: 'Alt+Shift+D', talkShortcut: 'Alt+Shift+T', wordScript: 'native',
  showFullLine: true, checkpoints: true, reminder: '19:30', version: 2
}
const today = {
  streak: { days: 12, keptToday: false, freezesLeft: 1 },
  week: ['kept', 'kept', 'frozen', 'today', 'ahead', 'ahead', 'ahead'].map((state, i) => ({ day: `2026-10-${12 + i}`, state })),
  hasWatched: true,
  word: { key: 'es:madrugar', word: 'madrugar', meaning: 'to get up early', seen: 4, state: 'encountered', source: 'Un día en Madrid' },
  due: 14
}
const watching = [
  { key: 'youtube:dQw4w9WgXcQ', site: 'youtube', siteName: 'YouTube', videoId: 'dQw4w9WgXcQ', title: 'Cómo hacer tortilla española', position: 312, lastWatched: now - 3600000, watchedMs: 900000, subtitle: 'heat the sartén first', words: [{ key: 'es:sartén', word: 'sartén', state: 'known' }, { key: 'es:cebolla', word: 'cebolla', state: 'known' }, { key: 'es:huevo', word: 'huevo', state: 'speakable' }] },
  { key: 'youtube:9bZkp7q19f0', site: 'youtube', siteName: 'YouTube', videoId: '9bZkp7q19f0', title: 'Un día en Madrid', position: 85, lastWatched: now - day, watchedMs: 400000 },
  { key: 'youtube:kJQP7kiw5Fk', site: 'youtube', siteName: 'YouTube', videoId: 'kJQP7kiw5Fk', title: 'Despacito (en vivo)', position: 40, lastWatched: now - 3 * day, watchedMs: 200000 }
]
const words = [
  ['hola', 'usable'], ['gracias', 'usable'], ['cocina', 'speakable'], ['huevo', 'speakable'], ['sartén', 'known'],
  ['patata', 'known'], ['cebolla', 'known'], ['madrugar', 'encountered'], ['aprovechar', 'encountered'],
  ['lograr', 'encountered'], ['desarrollar', 'unknown'], ['quizás', 'unknown']
].map(([word, state]) => ({ key: `es:${word}`, word, seenAs: word, state }))
const counts = { unknown: 41, encountered: 63, known: 88, speakable: 27, usable: 19, ignored: 6 }
const card = (id, expression, meaning, state, dueIn) => ({
  id, revision: 1, paused: false, state, due: now + dueIn, reps: 3, lapses: 0, createdAt: now - 9 * day, updatedAt: now - day,
  language: 'es', source: {kind:'video',moment:{earlier:[],line:{original:'Ma?ana tengo que madrugar.',translation:'I have to get up early tomorrow.'},video:{site:'youtube',videoId:'dQw4w9WgXcQ',title:'Un d?a en Madrid',position:120}}},
  expression, meaning, type:'understand', target:expression, wordKey: `es:${expression}`
})
const cards = [card('c1', 'sartén', 'frying pan', 'review', -day), card('c2', 'madrugar', 'to get up early', 'learning', 0), card('c3', 'aprovechar', 'to make the most of', 'new', day)]

const off = () => {}
const later = (value) => Promise.resolve(value)
const mockView = { appearance: 'light', dark: false, platform: 'win32', layout: {open:[], split:{hubCol:.53,hubRow:.5,pair:.5,pairRow:.5,duet:.64,beside:.53,besideRow:.5,main:.56,stack:.5,main4:.5,stack4:.5},stacked:false,floating:false,corner:'br'} }
today.word = {key:'es:madrugar',word:'madrugar',meaning:'to get up early',seen:4,state:'encountered',source:'Un día en Madrid'}
const handlers = {
  'home.getView': () => later(mockView),
  'home.setView': change => { Object.assign(mockView,change); mockView.dark=mockView.appearance==='dark'; return later(mockView) },
  'daily.plan': () => later({cards:14,video:'Un día en Madrid · 1:25',say:{original:'Mañana tengo que madrugar.',translation:'I have to get up early tomorrow.'}}),
  'talk.open': () => later({chat:[],state:'idle'}),
  getState: () => later({ settings, status: { state: 'idle' }, fit: null }),
  'home.getToday': () => later(today),
  'home.getWatching': () => later(watching),
  'knowledge.summary': () => later({ counts, words }),
  'knowledge.states': () => later({}),
  'cards.list': () => later(cards),
  'cards.get': id => later({...cards.find(c=>c.id===id),reviews:[]}),
  'cards.startReview': () => later({counts:{due:2,newAvailable:1,laterToday:0},next:{card:cards[1],outcomes:Object.fromEntries(['again','hard','good','easy'].map((r,i)=>[r,{due:now+(i+1)*day,interval:['1 min','1 day','3 days','8 days'][i]}]))},canUndo:false}),
  'cards.getSettings': () => later({ newPerDay: 10 }),
  // The side panel (panel.html) on Explain, with a line explained and a short conversation.
  'panel.getState': () => later({ tab: 'explain', script: { source: 'recent', lines: [] }, current: null }),
  'panel.getLook': () => later({ dark: mockView.dark }),
  'explain.getState': () => later({
    loading: false,
    moment: {
      language: 'es', takenAt: now,
      line: { id: 7, original: 'No te preocupes, ya me las apañaré.', processed: { translation: 'Don’t worry, I’ll manage somehow.' } },
      earlier: [{ original: '¿Seguro que no necesitas ayuda?', translation: 'Are you sure you don’t need help?' }],
      video: { site: 'youtube', title: 'Un día en Madrid', position: 85 }
    },
    explanation: {
      meaning: 'She’s brushing off the offer: “don’t worry, I’ll sort it out myself”. It sounds relaxed and a little proud.',
      notice: { text: '“Apañárselas” means to get by with what you have. The “las” doesn’t point at anything; it’s part of the phrase.', quote: 'me las apañaré' },
      why: 'She was just asked if she needs help, and answers with “no te preocupes” first.',
      alternative: { expression: 'Ya me las arreglaré.', changes: 'Same meaning, heard all over the Spanish-speaking world; “apañar” sounds more like Spain.' },
      entry: { headword: 'apañárselas', syllables: 'a·pa·ñár·se·las', ipa: 'a.paˈɲaɾ.se.las', partOfSpeech: 'verb, reflexive', usually: 'to fix or patch something up (apañar)', otherMeanings: ['to tidy up', 'to dress up a little'] },
      card: { expression: 'me las apañaré', meaning: 'to manage on your own, somehow', target: 'apañárselas', situation: '' },
      model: 'mock', version: 1
    },
    chat: [
      { from: 'learner', text: 'Is this rude?', via: 'text' },
      { from: 'duet', text: 'No, it’s friendly. It just means she wants to handle it herself.', via: 'text' }
    ]
  })
}
const section = (path) =>
  new Proxy(function () {}, {
    get: (_, key) => (typeof key === 'symbol' ? undefined : section(path ? `${path}.${key}` : key)),
    apply: (_, __, args) => {
      if (handlers[path]) return handlers[path](...args)
      const last = path.split('.').pop()
      if (/^on[A-Z]/.test(last)) return off
      console.debug('[mock duet]', path, args)
      return later(undefined)
    }
  })
window.duet = section('')
