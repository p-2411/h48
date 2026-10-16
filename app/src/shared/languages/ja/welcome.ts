// What the first run says and asks in Japanese (renderer/src/welcome).
import type { Welcome } from '../module'

export const welcome: Welcome = {
  own: '日本語', video: 'steps', scene: 'On the steps',
  hello: '日本語！いいね。', helloEn: 'Japanese! Nice.',
  bands: [
    [{ word: '水', read: 'mizu', en: 'water', wrong: ['fire', 'tree', 'rice'] }, { word: '猫', read: 'neko', en: 'cat', wrong: ['dog', 'bird', 'fish'] }],
    [{ word: '鍵', read: 'kagi', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '台所', read: 'daidokoro', en: 'kitchen', wrong: ['bedroom', 'station', 'garden'] }],
    [{ word: '締め切り', read: 'shimekiri', en: 'deadline', wrong: ['closing time', 'entrance', 'appointment'] }, { word: '遠慮', read: 'enryo', en: 'holding back, out of politeness', wrong: ['long distance', 'patience', 'apology'] }],
    [{ word: '億劫', read: 'okkū', en: 'too much bother', wrong: ['enormous', 'ancient', 'wasteful'] }, { word: '几帳面', read: 'kichōmen', en: 'meticulous', wrong: ['shy', 'careless', 'stubborn'] }]
  ],
  full: '鍵はテーブルに置いといて。明日戻るから。',
  perfect: '完璧！'
}
