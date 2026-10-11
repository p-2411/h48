// A word's rung on the knowledge ladder (src/main/knowledge), by its key: the colour it glows in.
// Undefined until it arrives, or when there's no word.
import { useEffect, useState } from 'react'
import type { WordState } from '../../../shared/knowledge'
import type { Language } from '../../../shared/types'

export function useRung(language: Language, key: string | undefined): WordState | undefined {
  const [rung, setRung] = useState<{ key: string; state: WordState }>()
  useEffect(() => {
    if (!key) return
    let current = true
    window.duet.knowledge.states(language, [key]).then(
      (states) => current && states[key] && setRung({ key, state: states[key] }),
      () => undefined
    )
    return () => {
      current = false
    }
  }, [language, key])
  return key && rung?.key === key ? rung.state : undefined
}
