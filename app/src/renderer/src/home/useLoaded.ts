// What a home page shows from the main process: loaded on opening, again whenever the window comes
// back to the front or cards change (watching or reviewing happened meanwhile), and on Try again.
// A failed reload keeps what was shown.
import { useCallback, useEffect, useState } from 'react'
import { say } from '../components/errors'

export function useLoaded<T>(
  load: () => Promise<T>,
  failure: string
): { value?: T; error?: string; reload: () => void } {
  const [value, setValue] = useState<T>()
  const [error, setError] = useState<string>()
  const reload = useCallback(() => {
    load().then(
      (next) => {
        setValue(next)
        setError(undefined)
      },
      (cause) => setError(say(cause, failure))
    )
  }, [load, failure])
  useEffect(() => {
    reload()
    const offCards = window.duet.cards.onChanged(reload)
    window.addEventListener('focus', reload)
    return () => {
      offCards()
      window.removeEventListener('focus', reload)
    }
  }, [reload])
  return { value, error, reload }
}
