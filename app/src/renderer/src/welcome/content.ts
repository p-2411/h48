// What the first run says and asks, per language: Duet's hello, the placement test's words by
// frequency band, and the whole line that checks anyone placed high. From the design
// (design-preview/duet-merged/duet-merged.ts).
import type { Language } from '../../../shared/languages'

// A test word: the word, how it's read (Japanese, Korean), its meaning and three wrong ones.
export type Item = { word: string; read?: string; en: string; wrong: [string, string, string] }

export type Content = {
  own: string
  /** The speech voice's language tag. */
  voice: string
  /** The clip on the stage (public/video/welcome): a few seconds of stock footage, silent; and
   * what its label calls the scene. */
  video: string
  scene: string
  hello: string
  helloEn: string
  // Two words in each frequency band, commonest first (the first 500 words, to 2,000, to 5,000,
  // past 5,000).
  bands: [Item[], Item[], Item[], Item[]]
  /** A whole line, and its meaning picked from three, for anyone placed high. */
  full: string
  check: { right: string; wrong: [string, string] }
  perfect: string
}

const CHECK: Content['check'] = {
  right: 'Leave the keys on the table; I’ll be back tomorrow.',
  wrong: ['Take the keys off the table; I left yesterday.', 'The keys are on the table; come back tomorrow.']
}

export const CONTENT: Record<Language, Content> = {
  es: {
    own: 'Español', voice: 'es-ES', video: 'cafe-table', scene: 'Coffee break',
    hello: '¡Español! Me encanta.', helloEn: 'Spanish! I love it.',
    bands: [
      [{ word: 'el agua', en: 'water', wrong: ['bread', 'house', 'night'] }, { word: 'la casa', en: 'house', wrong: ['car', 'dog', 'street'] }],
      [{ word: 'la llave', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: 'la cocina', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
      [{ word: 'madrugar', en: 'to get up early', wrong: ['to stay up late', 'to hurry', 'to fall asleep'] }, { word: 'aprovechar', en: 'to make the most of', wrong: ['to put off', 'to waste', 'to approve'] }],
      [{ word: 'desvelarse', en: 'to stay awake all night', wrong: ['to reveal a secret', 'to wake someone', 'to faint'] }, { word: 'empalagoso', en: 'sickly sweet', wrong: ['bitter', 'sticky', 'stubborn'] }]
    ],
    full: 'Deja las llaves en la mesa; vuelvo mañana.',
    check: CHECK,
    perfect: '¡Perfecto!'
  },
  ja: {
    own: '日本語', voice: 'ja-JP', video: 'steps', scene: 'On the steps',
    hello: '日本語！いいね。', helloEn: 'Japanese! Nice.',
    bands: [
      [{ word: '水', read: 'mizu', en: 'water', wrong: ['fire', 'tree', 'rice'] }, { word: '猫', read: 'neko', en: 'cat', wrong: ['dog', 'bird', 'fish'] }],
      [{ word: '鍵', read: 'kagi', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '台所', read: 'daidokoro', en: 'kitchen', wrong: ['bedroom', 'station', 'garden'] }],
      [{ word: '締め切り', read: 'shimekiri', en: 'deadline', wrong: ['closing time', 'entrance', 'appointment'] }, { word: '遠慮', read: 'enryo', en: 'holding back, out of politeness', wrong: ['long distance', 'patience', 'apology'] }],
      [{ word: '億劫', read: 'okkū', en: 'too much bother', wrong: ['enormous', 'ancient', 'wasteful'] }, { word: '几帳面', read: 'kichōmen', en: 'meticulous', wrong: ['shy', 'careless', 'stubborn'] }]
    ],
    full: '鍵はテーブルに置いといて。明日戻るから。',
    check: CHECK,
    perfect: '完璧！'
  },
  ko: {
    own: '한국어', voice: 'ko-KR', video: 'cafe-window', scene: 'By the window',
    hello: '한국어! 좋아요.', helloEn: 'Korean! Great.',
    bands: [
      [{ word: '물', read: 'mul', en: 'water', wrong: ['fire', 'rice', 'tree'] }, { word: '집', read: 'jip', en: 'house', wrong: ['car', 'school', 'street'] }],
      [{ word: '열쇠', read: 'yeolsoe', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '부엌', read: 'bueok', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
      [{ word: '마감', read: 'magam', en: 'deadline', wrong: ['makeup', 'closing door', 'feeling'] }, { word: '눈치', read: 'nunchi', en: 'reading the room', wrong: ['eyesight', 'snowfall', 'jealousy'] }],
      [{ word: '서먹하다', read: 'seomeokhada', en: 'awkward, distant', wrong: ['bitter', 'sleepy', 'greedy'] }, { word: '아쉽다', read: 'aswipda', en: 'a shame it’s over', wrong: ['easy', 'relieved', 'impatient'] }]
    ],
    full: '열쇠는 탁자 위에 두고 가. 내일 돌아올게.',
    check: CHECK,
    perfect: '완벽해요!'
  }
}

// The learner's level, set by the placement: its own words, so it never reads like a word's rung.
export const LEVEL_NAMES = ['Starter', 'Beginner', 'Elementary', 'Intermediate', 'Upper intermediate']
// What that level does to the line, as Duet says it.
export const PLACED = ['So I’ll start with one easy word a line.', 'So I’ll swap in a couple of words a line.', 'So about three words a line.', 'So most of each line.', 'So nearly the whole line.']
// Duet's welcome at the end: the level, said as a good place to be.
export const WELCOME = [
  'You’re a Starter, and that’s the fun part.',
  'You’re a Beginner with a head start. Lovely.',
  'Elementary already. What a nice start!',
  'Intermediate already. You’re going to fly.',
  'Upper intermediate! We’re going to have fun.'
]
