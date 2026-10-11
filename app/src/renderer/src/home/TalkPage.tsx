// Talk: a free conversation with Duet in the language being learnt, typed or spoken, with no video
// line; the learner's saved cards are open to Duet. Coming back to Talk goes on with the conversation;
// New conversation starts over. The conversation itself is Explain's (explain/Conversation.tsx).
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ThreadState } from '../../../shared/explain'
import { languageName, type Language } from '../../../shared/languages'
import { say } from '../components/errors'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Conversation } from '../explain/Conversation'
import type { ThreadBridge } from '../explain/thread'
import { LoadState } from '../components/LoadState'

export function TalkPage(): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState>()
  const [language, setLanguage] = useState<Language>()
  // Opening Talk failed (LoadState shows it, with Try again), or a message or New conversation did.
  const [error, setError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [dock, setDock] = useState<HTMLElement | null>(null)
  const [mascotSlot, setMascotSlot] = useState<HTMLElement | null>(null)
  // A new conversation (New conversation) is a new Conversation, with its own voice session.
  const [round, setRound] = useState(0)
  const failed = useCallback((cause: unknown) => setError(say(cause, 'Could not reach Duet. Try again.')), [])
  const actionFailed = useCallback((cause: unknown) => setActionError(say(cause, 'Could not reach Duet. Try again.')), [])
  const bridge = useMemo<ThreadBridge>(
    () => ({
      ask: (text) => {
        setActionError(undefined)
        window.duet.talk.ask(text).catch(actionFailed)
      },
      voiceTurns: (turns) => void window.duet.talk.voiceTurns(turns).catch(actionFailed),
      claim: () => window.duet.talk.open()
    }),
    [actionFailed]
  )
  // Talk on show: the conversation is this window's again, in the language now set.
  const open = useCallback(() => {
    Promise.all([window.duet.talk.open(), window.duet.getState()]).then(([next, state]) => {
      setThread(next)
      setLanguage(state.settings.language)
      setError(undefined)
    }, failed)
  }, [failed])
  useEffect(() => {
    open()
    return window.duet.talk.onState(setThread)
  }, [open])
  // Another language chosen in Settings: Duet goes on in that one.
  useEffect(
    () =>
      window.duet.onSettings((settings) => {
        if (language && settings.language !== language) open()
      }),
    [language, open]
  )
  const startOver = (): void => {
    setActionError(undefined)
    window.duet.talk.start().then((next) => {
      setThread(next)
      setRound((count) => count + 1)
    }, actionFailed)
  }

  return (
    <main className="home-page home-talk">
      <div className="home-talk-head">
        <h1>Talk</h1>
        <div className="head-slot" ref={setMascotSlot} />
        {thread && thread.chat.length > 0 && (
          <button type="button" className="btn quiet" onClick={startOver}>
            New conversation
          </button>
        )}
      </div>
      {actionError && (
        <p className="notice error" role="alert">
          {actionError}
        </p>
      )}
      <div className="explain-scroll">
        <LoadState loaded={!!thread && !!language} error={error} reload={open} />
        {thread && language && (
          <>
            {thread.chat.length === 0 && (
              <p className="muted">
                Say anything in {languageName(language)}, or in English if you get stuck. Duet answers at your level, can look at
                the cards you saved, and helps you say it better. Type, or press the mic to talk.
              </p>
            )}
            <ErrorBoundary key={round} what="The conversation">
              <Conversation state={thread} language={language} thread={bridge} dock={dock} mascotSlot={mascotSlot} free />
            </ErrorBoundary>
          </>
        )}
      </div>
      <div className="explain-dock" ref={setDock} />
    </main>
  )
}
