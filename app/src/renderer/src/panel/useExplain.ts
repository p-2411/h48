import { useEffect, useState } from 'react'
import type { ExplainState } from '../../../shared/explain'

/** The Explain tab's state, kept in step with the main process. */
export function useExplain(): ExplainState {
  const [state, setState] = useState<ExplainState>({ loading: false, chat: [] })
  useEffect(() => {
    window.duet.explain.getState().then(setState)
    return window.duet.explain.onState(setState)
  }, [])
  return state
}
