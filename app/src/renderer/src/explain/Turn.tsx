// One turn of the conversation about a line, typed or spoken, as a message bubble: the learner's on
// the right, Duet's on the left (the last of a run of Duet's turns has a tail). Duet's turns in the language being learnt can show their English meaning (on request)
// and, for languages not written in Latin letters, their romanisation. Memoised on plain values
// (the thread is rebuilt each render), so a streaming voice turn doesn't re-render the others.
import { motion } from 'motion/react'
import { memo } from 'react'
import { languageName, speaks, type Language } from '../../../shared/languages'
import { Icon } from '../components/Icon'
import { Inline } from '../components/Inline'
import { fadeUp } from '../components/motion'
import type { Aid } from './aids'

export type TurnData = {
  id: string
  from: 'learner' | 'duet'
  text: string
  via?: 'text' | 'voice'
}


export const Turn = memo(function Turn({
  id,
  from,
  text,
  via,
  tail,
  language,
  revealed,
  meaning,
  reading,
  onReveal,
  onHide,
  enter = true
}: TurnData & {
  /** The bubble has a tail (the last of a run of Duet's turns). */
  tail?: boolean
  language: Language
  revealed: boolean
  meaning?: Aid
  reading?: Aid
  onReveal: (id: string, text: string) => void
  onHide: (id: string) => void
  /** Rises in when it arrives (false: it is already on screen in another form). */
  enter?: boolean
}): React.JSX.Element {
  const canReveal = from === 'duet' && speaks(language, text)
  // After a failed meaning the button offers Meaning again, so one press tries again.
  const showing = revealed && !meaning?.error
  const spoken = via === 'voice'
  return (
    <motion.article className={`turn ${from}`} data-turn={id} {...fadeUp(6)} initial={enter ? fadeUp(6).initial : false}>
      <div className="turn-body">
        <div className={`bubble${tail || from === 'learner' ? ' has-tail' : ''}`}>
          <span className="sr-only">{from === 'learner' ? 'You' : 'Duet'}: </span>
          <p className="turn-text" lang={canReveal ? language : undefined}>
            <Inline text={text} />
          </p>
          {canReveal && reading?.text && (
            <p className="turn-reading" aria-label={`${languageName(language)} in Latin letters`}>
              {reading.text}
            </p>
          )}
          {revealed && (
            <p className={`turn-meaning${meaning?.error ? ' has-error' : ''}`}>
              {meaning?.loading
                ? 'Showing the meaning…'
                : (meaning?.text ?? meaning?.error ?? 'Meaning unavailable.')}
            </p>
          )}
        </div>
        {(canReveal || spoken) && (
          <div className="turn-foot">
            {spoken && <span>Spoken</span>}
            {canReveal && (
              <button
                type="button"
                className={`meaning-button${showing ? ' is-on' : ''}`}
                aria-label={showing ? 'Hide English meaning' : 'Show English meaning'}
                onClick={() => (showing ? onHide(id) : onReveal(id, text))}
              >
                <Icon name="eye" size={13} />
                {showing ? 'Hide meaning' : 'Meaning'}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
})
