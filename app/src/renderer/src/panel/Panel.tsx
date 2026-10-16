// The side panel beside the video: Script and Explain tabs (Review is in the home base). The window's
// own buttons close it. Duet sits in the middle of the top bar, as in the home base: pressing it
// opens the conversation about the line in this window (on Explain), with Duet's face at its head as
// in Talk, and pressing it again closes it; while it is open, the face in the bar turns into a speech
// bubble, as in the home base. It is drawn
// as the home base is (workspace.css, pages.css), light or dark as the home base is.
import { useState } from 'react'
import { DuetMascot } from '../components/duet/DuetMascot'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { LoadState } from '../components/LoadState'
import { ExplainView } from '../explain/ExplainView'
import { Script } from './Script'
import { useExplain } from './useExplain'
import { useLook } from './useLook'
import { usePanel } from './usePanel'
import { useSwipeAway } from './useSwipeAway'

export function Panel(): React.JSX.Element {
  const { tab, setTab, script, current, loaded, loadError, reload } = usePanel()
  const explain = useExplain()
  const [chatOpen, setChatOpen] = useState(false)
  const dark = useLook()
  // A swipe toward the screen's edge closes it.
  useSwipeAway()
  // Another line explained: its entry first, the chat closed.
  const takenAt = explain?.moment?.takenAt
  const [chatFor, setChatFor] = useState(takenAt)
  if (chatFor !== takenAt) {
    setChatFor(takenAt)
    setChatOpen(false)
  }
  const canChat = !!explain?.moment
  const chatting = chatOpen && tab === 'explain' && canChat
  const toggleChat = (): void => {
    if (chatting) return setChatOpen(false)
    setTab('explain')
    setChatOpen(true)
  }
  return (
    <main className="window workspace">
      <header className="window-head">
        <div className="segment" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'script'} onClick={() => setTab('script')}>
            {script.source === 'transcript' ? 'Script' : 'Recent lines'}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'explain'} onClick={() => setTab('explain')}>
            Explain
          </button>
        </div>
        {canChat && (
          <button
            type="button"
            className={`bar-duet${chatting ? ' is-open' : ''}`}
            aria-label={chatting ? 'Close the chat with Duet' : 'Ask Duet about this line'}
            title={chatting ? 'Close the chat with Duet' : 'Ask Duet about this line'}
            aria-pressed={chatting}
            onClick={toggleChat}
          >
            <span className="duet-swap">
              <span className="bar-face">
                <DuetMascot state="idle" width={30} finish="flat" theme={dark ? 'dark' : 'light'} watch={chatting ? 'off' : 'near'} label="Duet" />
              </span>
              {chatting && (
                <svg className="bar-chat" width="38" height="36" viewBox="0 0 38 36" aria-hidden="true">
                  <path d="M10 3.5h18a7.5 7.5 0 0 1 7.5 7.5v9a7.5 7.5 0 0 1-7.5 7.5H17l-6.5 5.2v-5.2H10A7.5 7.5 0 0 1 2.5 20v-9A7.5 7.5 0 0 1 10 3.5z" />
                  <circle cx="12.5" cy="15.5" r="2.3" />
                  <circle cx="19" cy="15.5" r="2.3" />
                  <circle cx="25.5" cy="15.5" r="2.3" />
                </svg>
              )}
            </span>
            <span className="bar-line" aria-hidden="true" />
          </button>
        )}
      </header>
      {/* Keyed by tab, so a tab that broke can be left and come back fresh, and the others still work. */}
      <ErrorBoundary key={tab} what="This tab">
        {!loaded ? (
          <LoadState loaded={false} error={loadError} reload={reload} />
        ) : tab === 'script' ? (
          <Script script={script} current={current} />
        ) : explain ? (
          <ExplainView
            state={explain}
            onReplay={window.duet.explain.replay}
            onRetry={window.duet.explain.retry}
            chatOpen={chatting}
            onCloseChat={() => setChatOpen(false)}
          />
        ) : (
          <LoadState loaded={false} reload={reload} />
        )}
      </ErrorBoundary>
    </main>
  )
}
