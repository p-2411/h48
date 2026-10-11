// The side panel beside the video: Script, Explain and Review tabs.
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
          <button type="button" role="tab" aria-pressed={tab === 'script'} onClick={() => setTab('script')}>
            {script.source === 'transcript' ? 'Script' : 'Recent lines'}
          </button>
          <button type="button" role="tab" aria-pressed={tab === 'explain'} onClick={() => setTab('explain')}>
            Explain
          </button>
          <button type="button" role="tab" aria-pressed={tab === 'review'} onClick={() => setTab('review')}>
            Review
          </button>
        </div>
        <button type="button" className="close" aria-label="Close" onClick={() => window.duet.panel.close()}>
          ×
        </button>
      </header>
      {tab === 'script' ? (
        <Script script={script} current={current} />
      ) : tab === 'explain' ? (
        <ExplainView state={explain} onReplay={window.duet.explain.replay} onRetry={window.duet.explain.retry} />
      ) : (
        <Review onEnd={() => setTab('script')} />
      )}
    </main>
  )
}
