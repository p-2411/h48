// The message bar, as Talk and Explain both show it: common questions above it, then one pill with
// the message box, the mic (it switches to voice) and Send inside. The draft lives in Conversation,
// so it survives a spell in voice.
import type { RefObject } from 'react'
import type { Language } from '../../../shared/languages'
import { focusMessageBox } from './focus'
import { Icon } from '../components/Icon'

// Common questions that fill in the message box (to send as is, or finish first): about a line, or
// in a free conversation.
const PILLS = {
  line: [
    { label: 'Explain more', text: 'Explain more' },
    { label: 'Can I say this?', text: 'Can I say ' }
  ],
  free: [
    { label: 'How do I say…?', text: 'How do I say ' },
    { label: 'Can I say this?', text: 'Can I say ' }
  ]
}

export function Composer({
  box,
  draft,
  onDraft,
  language,
  replying,
  onStartVoice,
  onSend,
  free = false
}: {
  box: RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraft: (text: string) => void
  language: Language
  replying: boolean
  onStartVoice: () => void
  /** Sends the learner's message to Duet. */
  onSend: (text: string) => void
  /** A free conversation (Talk), not about a line. */
  free?: boolean
}): React.JSX.Element {
  const send = (): void => {
    const text = draft.trim()
    if (!text || replying) return
    onSend(text)
    onDraft('')
    // A click on Send leaves focus on the button, which is disabled while Duet replies.
    focusMessageBox(box)
  }
  const fill = (text: string): void => {
    onDraft(text)
    focusMessageBox(box, text.length)
  }

  return (
    <>
      <div className="chips">
        {PILLS[free ? 'free' : 'line'].map((pill) => (
          <button key={pill.label} type="button" className="pill" onClick={() => fill(pill.text)}>
            {pill.label}
          </button>
        ))}
      </div>
      <div className="message-bar">
        <textarea
          ref={box}
          id="conversation-message"
          rows={1}
          lang={language}
          placeholder={free ? 'Say something, or ask Duet anything' : 'Ask about this line, or practise it'}
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
        />
        <button
          type="button"
          className="bar-mic"
          title="Talk instead: Duet hears you, and how you say it"
          aria-label="Talk to Duet"
          onClick={onStartVoice}
        >
          <Icon name="mic" size={15} />
        </button>
        <button
          type="button"
          className="bar-send"
          aria-label="Send"
          disabled={!draft.trim() || replying}
          onClick={send}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </>
  )
}
