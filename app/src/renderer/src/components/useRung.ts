// A word's rung on the knowledge ladder (src/main/knowledge), by its key: the colour it glows in.
// Undefined until it arrives, or when there's no word; asked again whenever something the learner
// did may have moved a word (a save, an ignore, a review).
import { useEffect, useState } from 'react'
import type { WordState } from '../../../shared/knowledge'
import type { Language } from '../../../shared/types'

export function useRung(language: Language, key: string | undefined): WordState | undefined {
  const [rung, setRung] = useState<{ key: string; state: WordState }>()
  const [changes, setChanges] = useState(0)
  useEffect(() => window.duet.knowledge.onChanged(() => setChanges((count) => count + 1)), [])
  useEffect(() => {
    if (!key) return
    let current = true
    window.duet.knowledge.states(language, [key]).then(
      (states) => current && states[key] && setRung({ key, state: states[key] }),
      (cause) => console.warn('[duet] could not read how well the word is known', cause)
    )
    return () => {
      current = false
    }
  }, [language, key, changes])
  return key && rung?.key === key ? rung.state : undefined
}
