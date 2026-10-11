// The conversation surface Talk and Explain share: a column that scrolls (what the page puts on top,
// then Duet's first message, then the conversation) above a dock that holds the suggestions and the
// message bar, so the bar stays put and nothing scrolls under it. Explain puts the line's card on
// top and the explanation as Duet's first message; Talk, its greeting.
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { fadeUp } from '../components/motion'

export function ChatSurface({
  className,
  top,
  children
}: {
  className?: string
  /** Above the conversation, scrolling with it (Explain: the line's card, and the explanation). */
  top?: ReactNode
  /** The conversation, given the dock to put its message bar in. */
  children: (dock: HTMLElement | null) => ReactNode
}): React.JSX.Element {
  const [dock, setDock] = useState<HTMLDivElement | null>(null)
  return (
    <div className={className ? `chat ${className}` : 'chat'}>
      <div className="chat-scroll">
        {top}
        {children(dock)}
      </div>
      <div className="chat-dock" ref={setDock} />
    </div>
  )
}

/** A message from Duet that isn't a turn of the conversation (Explain's explanation, Talk's
 * greeting, Duet still explaining), drawn as Duet's turns are. */
export function DuetBubble({
  children,
  label,
  below
}: {
  children: ReactNode
  label?: string
  below?: ReactNode
}): React.JSX.Element {
  return (
    <motion.article className="turn duet" aria-label={label} {...fadeUp(6)}>
      <div className="turn-body">
        <div className="bubble has-tail">{children}</div>
        {below && <div className="turn-foot">{below}</div>}
      </div>
    </motion.article>
  )
}
