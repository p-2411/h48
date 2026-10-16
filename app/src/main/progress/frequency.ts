// The word-frequency lists reading levels are graded by (shared/languages/<code>/frequency.json): each language's most
// common words, ranked from 1. A list is read into a lookup the first time it's needed.
import type { RankOf } from '../../shared/progress'
import type { Language } from '../../shared/types'
import { FREQUENCY_LISTS } from './frequency-lists'

const lookups = new Map<Language, Map<string, number>>()

/** A word's rank in `language`'s list (1 is the most common), or undefined when it isn't listed. */
export function rankOf(language: Language): RankOf {
  let ranks = lookups.get(language)
  if (!ranks) {
    const built = new Map<string, number>()
    FREQUENCY_LISTS[language].forEach((word, index) => {
      if (!built.has(word)) built.set(word, index + 1)
    })
    lookups.set(language, built)
    ranks = built
  }
  const lookup = ranks
  return (form) => lookup.get(form)
}
