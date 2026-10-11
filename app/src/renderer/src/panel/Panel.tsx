// The side panel beside the video: Script and Explain tabs (Review is in the home base). The window's
// own buttons close it. On Explain, Duet's mascot sits in the top bar, right of the tabs.
import { useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ExplainView } from '../explain/ExplainView'
import { Script } from './Script'
import { useExplain } from './useExplain'
import { usePanel } from './usePanel'

export function Panel(): React.JSX.Element {
  const { tab, setTab, script, current, loaded } = usePanel()
  const explain = useExplain()
  const [mascotSlot, setMascotSlot] = useState<HTMLDivElement | null>(null)
  return (
    <main className="window">
      <header className="window-head">
        <div className="segment" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'script'} onClick={() => setTab('script')}>
            {script.source === 'transcript' ? 'Script' : 'Recent lines'}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'explain'} onClick={() => setTab('explain')}>
            Explain
          </button>
        </div>
        {tab === 'explain' && <div className="head-slot" ref={setMascotSlot} />}
      </header>
      {/* Keyed by tab, so a tab that broke can be left and come back fresh, and the others still work. */}
      <ErrorBoundary key={tab} what="This tab">
        {!loaded ? (
          <p className="faint" role="status">
            Loading…
          </p>
        ) : tab === 'script' ? (
          <Script script={script} current={current} />
        ) : explain ? (
          <ExplainView state={explain} onReplay={window.duet.explain.replay} onRetry={window.duet.explain.retry} mascotSlot={mascotSlot} />
        ) : (
          <p className="faint" role="status">
            Loading…
          </p>
        )}
      </ErrorBoundary>
    </main>
  )
}
