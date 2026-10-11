// One line per language for the welcome window to show the levels and the colours on, before any
// video: "My sister bought a new car."
import type { Language, ProcessedLine, Token, WordJob } from '../../../shared/types'

const t = (text: string, job: WordJob, pair: number | null, space = true): Token => ({ text, job, pair, space })

const ENGLISH = (my: number | null): Token[] => [
  t('My', 'p', my),
  t('sister', 'n', 2),
  t('bought', 'v', 3),
  t('a', 'g', 4),
  t('new', 'a', 6),
  t('car', 'n', 5, false),
  t('.', 'g', null)
]

export const SAMPLES: Record<Language, ProcessedLine> = {
  es: {
    translation: 'My sister bought a new car.',
    source: [t('Mi', 'p', 1), t('hermana', 'n', 2), t('compró', 'v', 3), t('un', 'g', 4), t('coche', 'n', 5), t('nuevo', 'a', 6, false), t('.', 'g', null)],
    english: ENGLISH(1)
  },
  ja: {
    translation: 'My sister bought a new car.',
    source: [t('妹', 'n', 2, false), t('は', 'g', null, false), t('新しい', 'a', 6, false), t('車', 'n', 5, false), t('を', 'g', null, false), t('買った', 'v', 3, false), t('。', 'g', null)],
    english: ENGLISH(null)
  },
  ko: {
    translation: 'My sister bought a new car.',
    source: [t('여동생', 'n', 2, false), t('이', 'g', null), t('새', 'a', 6), t('차', 'n', 5, false), t('를', 'g', null), t('샀어요', 'v', 3, false), t('.', 'g', null)],
    english: ENGLISH(null)
  }
}
