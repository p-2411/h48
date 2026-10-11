import { useEffect, useState } from 'react'
import type { ExplainState } from '../../../shared/explain'

/** The Explain tab's state, kept in step with the main process; undefined until it first arrives. */
export function useExplain(): ExplainState | undefined {
  const [state, setState] = useState<ExplainState>()
  useEffect(() => {
    window.duet.explain
      .getState()
      .then(setState)
      .catch(() => setState({ loading: false, chat: [], error: 'Could not load Explain. Try again from the strip.' }))
    return window.duet.explain.onState(setState)
  }, [])
  return state
}
