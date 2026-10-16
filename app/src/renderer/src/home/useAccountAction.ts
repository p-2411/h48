// Runs an account action from a button (sign in, upgrade…), keeping its error to show beside it.
import { useState } from 'react'
import { say } from '../components/errors'

/** Runs an account action, keeping its error to show. */
export function useAccountAction(): [
  string | undefined,
  (work: () => Promise<void>, fallback: string) => void
] {
  const [error, setError] = useState<string>()
  const run = (work: () => Promise<void>, fallback: string): void => {
    setError(undefined)
    work().catch((cause) => setError(say(cause, fallback)))
  }
  return [error, run]
}
