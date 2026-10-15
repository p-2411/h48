// The learner's account and plan, as main has it (src/main/account/connect.ts), kept current.
import { useEffect, useState } from 'react'
import type { AccountState } from '../../../shared/usage'

export function useAccount(): AccountState | undefined {
  const [state, setState] = useState<AccountState>()
  useEffect(() => {
    let live = true
    window.duet.account.get().then(
      (got) => live && setState(got),
      () => undefined
    )
    const stop = window.duet.account.onChanged(setState)
    return () => {
      live = false
      stop()
    }
  }, [])
  return state
}
