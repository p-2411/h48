// The Explain window: the explanation view, kept in step with the main process.
import { useEffect, useState } from 'react'
import type { ExplainState } from '../../../shared/explain'
import { ExplainView } from './ExplainView'

export function Explain(): React.JSX.Element {
  const [state, setState] = useState<ExplainState>({ loading: false })
  useEffect(() => {
    window.duet.explain.getState().then(setState)
    return window.duet.explain.onState(setState)
  }, [])
  return (
    <main className="window">
      <header className="window-head">
        <h1>Explain</h1>
        <button type="button" className="close" aria-label="Close" onClick={() => window.duet.explain.close()}>
          ×
        </button>
      </header>
      <ExplainView state={state} onReplay={window.duet.explain.replay} onRetry={window.duet.explain.retry} />
    </main>
  )
}
