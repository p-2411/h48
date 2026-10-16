// Settings › Feedback: a note to the Duet team. It goes to Duet's server (kept, then on to the team's
// Discord) and, with crash reports on, to Sentry; without either, an email opens instead. The menu
// bar's Send feedback… scrolls here and puts the cursor in the box.
import { useEffect, useRef, useState } from 'react'
import { say } from '../components/errors'
import { Toggle } from '../components/SettingControls'

export function FeedbackSection(): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [replyTo, setReplyTo] = useState(true)
  const [details, setDetails] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'emailed'>('idle')
  const [error, setError] = useState<string>()
  const box = useRef<HTMLTextAreaElement>(null)
  const section = useRef<HTMLElement>(null)

  useEffect(
    () =>
      window.duet.home.onFeedback(() => {
        section.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        box.current?.focus()
      }),
    []
  )

  const send = async (): Promise<void> => {
    if (!message.trim() || state === 'sending') return
    setState('sending')
    setError(undefined)
    try {
      const { sent } = await window.duet.feedback.send({ message, replyTo, details, place: 'settings' })
      setMessage('')
      setState(sent.length === 1 && sent[0] === 'email' ? 'emailed' : 'sent')
    } catch (cause) {
      setState('idle')
      setError(say(cause, 'Your feedback couldn’t be sent. Try again.'))
    }
  }

  return (
    <section className="settings-group" aria-labelledby="settings-feedback" ref={section}>
      <h2 className="label" id="settings-feedback">
        Feedback
      </h2>
      <div className="glass">
        <label className="field feedback-field">
          <span className="muted">Something broken, confusing, or that you love? Tell us.</span>
          <textarea
            ref={box}
            rows={4}
            maxLength={4000}
            value={message}
            placeholder="What happened, and what you expected…"
            onChange={(event) => {
              setMessage(event.target.value)
              if (state !== 'sending') setState('idle')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send()
            }}
          />
        </label>
        <Toggle on={replyTo} label="Let us reply by email" hint="Your account’s email goes with it" onChange={setReplyTo} />
        <Toggle
          on={details}
          label="Include Duet’s version and your system"
          hint="Helps us find bugs. Never what you watch, hear or say"
          onChange={setDetails}
        />
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={!message.trim() || state === 'sending'}
            onClick={() => void send()}
          >
            {state === 'sending' ? 'Sending…' : 'Send feedback'}
          </button>
          <span className="muted" role="status">
            {state === 'sent' ? 'Thanks — the team has it.' : state === 'emailed' ? 'Your email app opened with it.' : ''}
          </span>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
