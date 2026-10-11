// The conversation about a line, after its explanation. The pills fill in the message box with a
// common question (to send as is, or finish first); Enter sends, Shift+Enter starts a new line.
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../shared/explain'
import { Inline } from '../components/Inline'

const PILLS = [
  { label: 'Explain more', text: 'Explain more' },
  { label: 'Can I say this?', text: 'Can I say ' }
]

export function Chat({
  chat,
  replying,
  error,
  lang
}: {
  chat: ChatMessage[]
  replying?: boolean
  error?: string
  lang: string
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  // Keep the newest message in view. (Braces matter: scrollIntoView returns a promise here, and an
  // effect may only return a clean-up function.)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, replying])

  const send = (): void => {
    const text = draft.trim()
    if (!text || replying) return
    window.duet.explain.ask(text)
    setDraft('')
  }
  const fill = (text: string): void => {
    setDraft(text)
    // Put the cursor at the end, ready to finish the question.
    requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(text.length, text.length)
    })
  }

  return (
    <section className="chat" aria-label="Ask about this line">
      {chat.map((message, index) => (
        <p key={index} className={`message ${message.from}`}>
          <Inline text={message.text} />
        </p>
      ))}
      {replying && <p className="message duet muted">…</p>}
      {error && <p className="notice error">{error}</p>}
      <div ref={end} />
      <div className="composer">
        <div className="row">
          {PILLS.map((pill) => (
            <button key={pill.label} type="button" className="pill" onClick={() => fill(pill.text)}>
              {pill.label}
            </button>
          ))}
        </div>
        <div className="input-row">
          <textarea
            ref={box}
            rows={1}
            lang={lang}
            placeholder="Ask about this line"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
          />
          <button type="button" className="btn primary" disabled={!draft.trim() || replying} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </section>
  )
}
