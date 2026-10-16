// The sample cards "How cards work" walks through: a few Spanish words on every step, a sample
// review, sample collections and videos, and the word pages. Everything lives here, in memory: the
// tour's review and Words read this instead of the main process, so nothing is saved, rated or
// scheduled, and the learner's own words come back untouched when the tour ends.
import type { Card } from '../../../../shared/cards'
import {
  sameWord,
  splitLine,
  type CardKind,
  type CollectionView,
  type DictEntry,
  type FlashcardView,
  type SessionScope,
  type SessionState,
  type SpokenCheck,
  type Step,
  type Tip,
  type TodayView,
  type VideoGroup,
  type WordView
} from '../../../../shared/flashcards'
import type { WordsData } from '../words/useWordsData'

type FlashcardsApi = Window['duet']['flashcards']
/** What the review uses from the main process. */
export type SessionApi = Pick<
  FlashcardsApi,
  | 'start'
  | 'answer'
  | 'state'
  | 'undo'
  | 'speak'
  | 'checkSpoken'
  | 'checkTyped'
  | 'checkUse'
  | 'replay'
>
/** What a word's page uses from the main process. */
export type WordApi = Pick<FlashcardsApi, 'word' | 'setSooner' | 'setPaused' | 'replay' | 'picture'>

const DAY = 86_400_000
const STATE_OF: Record<Step, 'encountered' | 'known' | 'speakable' | 'usable'> = {
  heard: 'encountered',
  known: 'known',
  say: 'speakable',
  use: 'usable'
}

type SampleWord = {
  key: string
  word: string
  step: Step
  kind: CardKind
  meaning: string
  entry: DictEntry
  line?: { text: string; translation: string; video: string; at: number }
  heardTimes: number
  tips: Tip[]
  situation?: string
  /** Due now: in today's sample review. */
  due: boolean
}

const WORDS: SampleWord[] = [
  {
    key: 'es:madrugar',
    word: 'madrugar',
    step: 'heard',
    kind: 'sentence',
    meaning: 'to get up early, usually because you have to',
    entry: {
      word: 'madrugar',
      syllables: 'ma·dru·gar',
      ipa: '/ma.ðɾuˈɣaɾ/',
      pos: 'verb',
      senses: ['to get up early', 'to get ahead of others'],
      related: ['madrugada, the small hours', 'madrugador, an early riser']
    },
    line: {
      text: 'Mañana tengo que madrugar.',
      translation: 'I have to get up early tomorrow.',
      video: 'Un día en Madrid',
      at: 85
    },
    heardTimes: 4,
    tips: [
      { label: 'Tip', text: 'Most often heard as tengo que madrugar, I have to get up early.' }
    ],
    due: true
  },
  {
    key: 'es:aprovechar',
    word: 'aprovechar',
    step: 'heard',
    kind: 'word',
    meaning: 'to make the most of',
    entry: {
      word: 'aprovechar',
      syllables: 'a·pro·ve·char',
      ipa: '/a.pɾo.βeˈtʃaɾ/',
      pos: 'verb',
      senses: ['to make the most of', 'to take advantage of'],
      related: [],
      example: {
        line: 'Hay que aprovechar el buen tiempo.',
        translation: 'You have to make the most of the good weather.'
      }
    },
    heardTimes: 0,
    tips: [{ label: 'Tip', text: '¡Que aproveche! is what people say before a meal.' }],
    due: true
  },
  {
    key: 'es:sartén',
    word: 'sartén',
    step: 'known',
    kind: 'gap',
    meaning: 'frying pan',
    entry: {
      word: 'sartén',
      syllables: 'sar·tén',
      ipa: '/saɾˈten/',
      pos: 'noun',
      gender: 'feminine',
      article: 'la',
      senses: ['frying pan'],
      related: []
    },
    line: {
      text: 'Calienta el aceite en la sartén.',
      translation: 'Heat the oil in the frying pan.',
      video: 'Tortilla española',
      at: 124
    },
    heardTimes: 2,
    tips: [{ label: 'Careful', text: 'It ends in -n but it’s la sartén, not el.' }],
    due: true
  },
  {
    key: 'es:vale',
    word: 'vale',
    step: 'use',
    kind: 'fresh',
    meaning: 'okay, sounds good',
    entry: {
      word: 'vale',
      syllables: 'va·le',
      ipa: '/ˈba.le/',
      pos: 'interjection',
      senses: ['okay, sounds good'],
      related: []
    },
    line: {
      text: 'Vale, nos vemos luego.',
      translation: 'Okay, see you later.',
      video: 'Spanish on the street',
      at: 122
    },
    heardTimes: 9,
    tips: [],
    due: true
  },
  {
    key: 'es:cocina',
    word: 'cocina',
    step: 'say',
    kind: 'use',
    meaning: 'cooks; the kitchen',
    entry: {
      word: 'cocina',
      syllables: 'co·ci·na',
      ipa: '/koˈθi.na/',
      pos: 'verb, noun',
      senses: ['cooks', 'the kitchen'],
      related: []
    },
    line: {
      text: 'Mi abuela cocina los domingos.',
      translation: 'My grandmother cooks on Sundays.',
      video: 'Tortilla española',
      at: 48
    },
    heardTimes: 3,
    tips: [{ label: 'Tip', text: 'As a verb, she cooks; with la, the kitchen.' }],
    situation: 'A friend asks what your family does on Sundays.',
    due: false
  }
]

function cardOf(sample: SampleWord, now: number): Card {
  return {
    id: `sample-${sample.word}`,
    type: 'understand',
    expression: sample.word,
    meaning: sample.meaning,
    target: sample.word,
    situation: sample.situation,
    language: 'es',
    source: { kind: 'tutor' },
    wordKey: sample.key,
    example: sample.line ? undefined : { line: sample.entry.example?.line ?? '', byDuet: true },
    revision: 1,
    paused: false,
    state: sample.step === 'heard' ? 'new' : 'review',
    due: sample.due ? now - 60_000 : now + 3 * DAY,
    reps: sample.step === 'heard' ? 0 : 4,
    lapses: 0,
    createdAt: now - 5 * DAY,
    updatedAt: now - DAY
  }
}

const lineOf = (sample: SampleWord): FlashcardView['line'] => {
  const text = sample.line?.text ?? sample.entry.example?.line
  if (!text) return undefined
  return {
    ...splitLine(text, [sample.word]),
    translation: sample.line?.translation ?? sample.entry.example?.translation
  }
}
const heardOf = (sample: SampleWord): FlashcardView['lastHeard'] =>
  sample.line && {
    line: sample.line.text,
    translation: sample.line.translation,
    video: sample.line.video,
    at: sample.line.at,
    replayable: false
  }

function viewOf(sample: SampleWord, now: number): FlashcardView {
  return {
    card: cardOf(sample, now),
    kind: sample.kind,
    step: sample.step,
    word: sample.word,
    entry: sample.entry,
    meaning: sample.meaning,
    line: lineOf(sample),
    lastHeard: heardOf(sample),
    heardTimes: sample.heardTimes,
    tips: sample.tips,
    situation: sample.situation,
    voice: false
  }
}

/** Review's today, for the tour. */
export function sampleToday(): TodayView {
  return {
    counts: { new: 2, learning: 0, review: 2 },
    total: 4,
    upToday: WORDS.filter((word) => word.due).map((word) => ({ word: word.word, step: word.step })),
    ladder: { heard: 12, known: 9, say: 4, use: 6 }
  }
}

/** Collections, for the tour. */
export function sampleCollections(): CollectionView[] {
  return [
    {
      id: 'sample-videos',
      name: 'From your videos',
      meta: 'Kept while watching',
      cards: 26,
      due: 3,
      top: { word: 'madrugar', meaning: 'to get up early', step: 'heard' }
    },
    {
      id: 'sample-deck',
      name: 'Spanish 5000',
      meta: 'From Anki',
      cards: 2340,
      due: 1,
      top: { word: 'aprovechar', meaning: 'to make the most of', step: 'heard' }
    },
    {
      id: 'sample-tag',
      name: 'Kitchen words',
      meta: 'From Anki, a tag',
      cards: 18,
      due: 0,
      top: { word: 'sartén', meaning: 'frying pan', step: 'known' }
    }
  ]
}

/** By video, for the tour. */
export function sampleVideos(now = Date.now()): VideoGroup[] {
  return [
    {
      id: 'sample-v1',
      title: 'Un día en Madrid',
      site: 'YouTube',
      watched: now - DAY,
      words: [
        { word: 'madrugar', step: 'heard' },
        { word: 'vale', step: 'use' }
      ],
      cards: 9,
      due: 2,
      line: 'Mañana tengo que madrugar.'
    },
    {
      id: 'sample-v2',
      title: 'Tortilla española',
      site: 'YouTube',
      watched: now - 3 * DAY,
      words: [
        { word: 'sartén', step: 'known' },
        { word: 'cocina', step: 'say' }
      ],
      cards: 11,
      due: 1,
      line: 'Calienta el aceite en la sartén.'
    }
  ]
}

/** Words, for the tour: the sample words and their cards. */
export function sampleWords(now = Date.now()): WordsData {
  const counts = { unknown: 0, encountered: 0, known: 0, speakable: 0, usable: 0, ignored: 0 }
  for (const word of WORDS) counts[STATE_OF[word.step]]++
  return {
    language: 'es',
    at: now,
    summary: {
      counts,
      words: WORDS.map((word) => ({
        key: word.key,
        word: word.word,
        seenAs: word.word,
        state: STATE_OF[word.step]
      }))
    },
    cards: WORDS.map((word) => cardOf(word, now))
  }
}

/** The word the tour opens in Words. */
export const SAMPLE_WORD = 'es:madrugar'

/** A word's page and a review, both in memory. Practise now on a sample word reviews that word. */
export function sampleApi(): SessionApi & WordApi {
  let deck: SampleWord[] = []
  let at = 0
  let scope: SessionScope = { kind: 'today' }
  const sooner = new Set<string>()
  const paused = new Set<string>()
  const now = (): number => Date.now()
  const state = (answered?: SessionState['answered']): SessionState => ({
    scope,
    next: deck[at] && viewOf(deck[at], now()),
    done: at,
    total: deck.length,
    canUndo: at > 0,
    answered,
    climbed: 0
  })
  const byId = (id: string): SampleWord | undefined =>
    WORDS.find((word) => `sample-${word.word}` === id)
  const check = (id: string, answer: string): SpokenCheck => {
    const word = byId(id)
    const good = !!word && sameWord(answer, [word.word])
    return {
      heard: answer,
      good,
      note: good ? 'That’s it.' : `It’s ${word?.word ?? 'another word'}.`
    }
  }
  const page = (key: string): WordView => {
    const sample = WORDS.find((word) => word.key === key) ?? WORDS[0]
    const card = cardOf(sample, now())
    return {
      key: sample.key,
      word: sample.word,
      step: sample.step,
      entry: sample.entry,
      meaning: sample.meaning,
      line: lineOf(sample),
      lastHeard: heardOf(sample),
      heardTimes: sample.heardTimes,
      tips: sample.tips,
      cards: [card],
      nextReview: card.due,
      sooner: sooner.has(key),
      paused: paused.has(key),
      ignored: false
    }
  }
  return {
    start: async (next) => {
      scope = next
      at = 0
      deck =
        next.kind === 'practise'
          ? WORDS.filter((word) => word.key === next.key)
          : WORDS.filter((word) => word.due)
      return state()
    },
    answer: async (cardId, signals) => {
      const word = byId(cardId)
      at = Math.min(deck.length, at + 1)
      return state(
        word && { word: word.word, comesBack: signals.got ? 'in 4 days' : 'in a minute' }
      )
    },
    state: async () => state(),
    undo: async () => {
      at = Math.max(0, at - 1)
      return state()
    },
    speak: async () => {
      throw new Error('The sample cards have no sound.')
    },
    checkSpoken: async (id) => ({ heard: byId(id)?.word ?? '', good: true, note: 'Sounds right.' }),
    checkTyped: async (id, answer) => check(id, answer),
    checkUse: async () => ({
      heard: '',
      good: true,
      note: 'Natural. That’s how a Spaniard would say it.'
    }),
    word: async (_language, key) => page(key),
    setSooner: async (_language, key, on) => (on ? sooner.add(key) : sooner.delete(key), page(key)),
    setPaused: async (_language, key, on) => (on ? paused.add(key) : paused.delete(key), page(key)),
    replay: async () => false,
    picture: async () => undefined
  }
}
