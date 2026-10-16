// Japanese.
import { sampleEnglish, token as t, type LanguageModule } from './module'

export const ja: LanguageModule = {
  name: 'Japanese',
  // Kana marks Japanese; kanji alone could be Chinese, so it only counts alongside kana.
  recognise: { kind: 'script', letters: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu, alsoCounts: /\p{Script=Han}/gu, share: 0.3 },
  reading: {
    name: 'Hepburn romanisation',
    instructions:
      'Convert the Japanese text into readable Modified Hepburn romanisation for an English-speaking learner. Infer kanji readings from context. Use ordinary Latin letters, spaces and punctuation; write long vowels plainly (ou, uu) and doubled consonants accurately. Return only the romanisation. Do not translate, label, explain or add quotation marks.'
  },
  syllables: false,
  sample: {
    translation: 'My sister bought a new car.',
    source: [t('妹', 'n', 2, false), t('は', 'g', null, false), t('新しい', 'a', 6, false), t('車', 'n', 5, false), t('を', 'g', null, false), t('買った', 'v', 3, false), t('。', 'g', null)],
    english: sampleEnglish(null)
  },
  phrasing:
    'Japanese has no spaces: a phrase is a word or a few words, never single characters, and keeps a verb or adjective together with its inflection (食べました). Particles (は, が, を, に, で, と, の…) between phrases stay out; a particle inside a phrase stays in it ("お腹が空いた" = "I\'m hungry").',
  tutor: {
    speech: ['Speak Japanese with clear, natural standard Japanese pronunciation. Preserve mora timing, long vowels, doubled consonants and Japanese rhythm.'],
    corrections: [
      'Particles (は against が, に against で, を).',
      'Politeness level: plain against です/ます forms, and keeping one level through a sentence.',
      'Verb and adjective forms (て-form, past, negative), and long vowels or doubled consonants that change the word.'
    ],
    delivery: [
      'Pitch accent can change the word (はし: bridge or chopsticks); English-style stress sounds foreign.',
      'Sentence-final particles carry the tone: a rising か asks, ね seeks agreement, a hard よ can sound pushy.',
      'Polite speech is said softly and evenly; said clipped or loud, polite words can still sound curt.'
    ]
  }
}
