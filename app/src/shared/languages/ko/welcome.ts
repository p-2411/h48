// What the first run says and asks in Korean (renderer/src/welcome).
import type { Welcome } from '../module'

export const welcome: Welcome = {
  own: '한국어', video: 'cafe-window', scene: 'By the window',
  hello: '한국어! 좋아요.', helloEn: 'Korean! Great.',
  bands: [
    [{ word: '물', read: 'mul', en: 'water', wrong: ['fire', 'rice', 'tree'] }, { word: '집', read: 'jip', en: 'house', wrong: ['car', 'school', 'street'] }],
    [{ word: '열쇠', read: 'yeolsoe', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '부엌', read: 'bueok', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
    [{ word: '마감', read: 'magam', en: 'deadline', wrong: ['makeup', 'closing door', 'feeling'] }, { word: '눈치', read: 'nunchi', en: 'reading the room', wrong: ['eyesight', 'snowfall', 'jealousy'] }],
    [{ word: '서먹하다', read: 'seomeokhada', en: 'awkward, distant', wrong: ['bitter', 'sleepy', 'greedy'] }, { word: '아쉽다', read: 'aswipda', en: 'a shame it’s over', wrong: ['easy', 'relieved', 'impatient'] }]
  ],
  full: '열쇠는 탁자 위에 두고 가. 내일 돌아올게.',
  perfect: '완벽해요!'
}
