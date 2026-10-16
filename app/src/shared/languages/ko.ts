// Korean.
import { sampleEnglish, token as t, type LanguageModule } from './module'

export const ko: LanguageModule = {
  name: 'Korean',
  recognise: { kind: 'script', letters: /\p{Script=Hangul}/gu, share: 0.3 },
  reading: {
    name: 'Revised Romanization',
    instructions:
      'Convert the Korean text into readable Revised Romanization of Korean for an English-speaking learner, written as it is pronounced (apply sound changes between syllables). Use ordinary Latin letters, spaces and punctuation. Return only the romanisation. Do not translate, label, explain or add quotation marks.'
  },
  syllables: false,
  sample: {
    translation: 'My sister bought a new car.',
    source: [t('여동생', 'n', 2, false), t('이', 'g', null), t('새', 'a', 6), t('차', 'n', 5, false), t('를', 'g', null), t('샀어요', 'v', 3, false), t('.', 'g', null)],
    english: sampleEnglish(null)
  },
  phrasing: 'A phrase takes the stem without its particle (은/는, 이/가, 을/를, 에, 에서, 의, 도, 와/과): "친구를" gives "친구" = "friend".',
  tutor: {
    speech: [
      'Speak Korean with clear, natural standard Seoul pronunciation. Keep the even syllable timing, and get final consonants (batchim), tense consonants and aspiration right, including sound changes across syllables.'
    ],
    corrections: [
      'Particles (은/는 against 이/가, 을/를, 에 against 에서).',
      'Speech level: 해요체 against 반말 or 합니다체, and keeping one level with the same person.',
      'Verb endings and tense, and sounds that change the word (plain, tense and aspirated consonants).'
    ],
    delivery: [
      'Endings carry the tone: the same sentence is a question or a statement by intonation alone (a rising 요 asks, a falling one states).',
      'A flat, clipped delivery can make 반말 sound rude; friendly 해요체 has a softer rise at the end.',
      'Syllables are even; English-style stress on one syllable sounds foreign.'
    ]
  }
}
