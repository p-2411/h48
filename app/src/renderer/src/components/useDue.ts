// How many cards can be reviewed now (due, plus new ones still allowed today), kept up to date.
// Undefined until it is known, so a window doesn't say "Nothing to review" before it has looked.
import { useEffect, useState } from 'react'

export function useDue(): number | undefined {
  const [due, setDue] = useState<number>()
  useEffect(() => {
    window.duet.getState().then(
      (state) => setDue(state.due.due + state.due.newAvailable),
      // Not known: the count stays off; the next change of counts fills it in.
      () => undefined
    )
    return window.duet.onDue((counts) => setDue(counts.due + counts.newAvailable))
  }, [])
  return due
}
