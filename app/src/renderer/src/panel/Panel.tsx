// The side panel beside the video: Script, Explain and Review tabs. The window's own buttons close it.
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ExplainView } from '../explain/ExplainView'
import { Review } from '../review/Review'
import { Script } from './Script'
import { useExplain } from './useExplain'
import { usePanel } from './usePanel'

export function Panel(): React.JSX.Element {
  const { tab, setTab, script, current } = usePanel()
  const explain = useExplain()
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
          <button type="button" role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>
            Review
          </button>
        </div>
      </header>
      {/* Keyed by tab, so a tab that broke can be left and come back fresh, and the others still work. */}
      <ErrorBoundary key={tab} what="This tab">
        {tab === 'script' ? (
          <Script script={script} current={current} />
        ) : tab === 'explain' ? (
          <ExplainView state={explain} onReplay={window.duet.explain.replay} onRetry={window.duet.explain.retry} />
        ) : (
          <Review onEnd={() => setTab('script')} />
        )}
      </ErrorBoundary>
    </main>
  )
}
