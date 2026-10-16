// What the first run says and asks in Spanish (renderer/src/welcome).
import type { Welcome } from '../module'

export const welcome: Welcome = {
  own: 'Español', video: 'cafe-table', scene: 'Coffee break',
  hello: '¡Español! Me encanta.', helloEn: 'Spanish! I love it.',
  bands: [
    [{ word: 'el agua', en: 'water', wrong: ['bread', 'house', 'night'] }, { word: 'la casa', en: 'house', wrong: ['car', 'dog', 'street'] }],
    [{ word: 'la llave', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: 'la cocina', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
    [{ word: 'madrugar', en: 'to get up early', wrong: ['to stay up late', 'to hurry', 'to fall asleep'] }, { word: 'aprovechar', en: 'to make the most of', wrong: ['to put off', 'to waste', 'to approve'] }],
    [{ word: 'desvelarse', en: 'to stay awake all night', wrong: ['to reveal a secret', 'to wake someone', 'to faint'] }, { word: 'empalagoso', en: 'sickly sweet', wrong: ['bitter', 'sticky', 'stubborn'] }]
  ],
  full: 'Deja las llaves en la mesa; vuelvo mañana.',
  perfect: '¡Perfecto!'
}
