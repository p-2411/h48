// One turn of the conversation about a line, typed or spoken. Duet's turns in the language being
// learnt can show their English meaning (on request) and, for languages not written in Latin
// letters, their romanisation. Memoised, so a streaming voice turn doesn't re-render the others.
import { memo } from 'react'
import { languageName, speaks, type Language } from '../../../shared/languages'
import { Inline } from '../components/Inline'

export type TurnData = { id: string; from: 'learner' | 'duet'; text: string; via?: 'text' | 'voice' }
export type Aid = { source: string; loading: boolean; text?: string; error?: string; failed?: boolean }

function EyeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M2.5 12s3.4-5.2 9.5-5.2 9.5 5.2 9.5 5.2-3.4 5.2-9.5 5.2S2.5 12 2.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export const Turn = memo(function Turn({
  turn,
  language,
  revealed,
  meaning,
  reading,
  onReveal,
  onHide
}: {
  turn: TurnData
  language: Language
  revealed: boolean
  meaning?: Aid
  reading?: Aid
  onReveal: (turn: TurnData) => void
  onHide: (id: string) => void
}): React.JSX.Element {
  const canReveal = turn.from === 'duet' && speaks(language, turn.text)
  return (
    <article className={`turn ${turn.from}`}>
      <header className="turn-heading">
        <span className="speaker">
          {turn.from === 'learner' ? 'You' : 'Duet'}
          {turn.via === 'voice' && <span className="via"> · spoken</span>}
        </span>
        {canReveal && (
          <button
            type="button"
            className={`meaning-button${revealed ? ' is-on' : ''}`}
            aria-label={revealed ? 'Hide English meaning' : 'Show English meaning'}
            onClick={() => (revealed ? onHide(turn.id) : onReveal(turn))}
          >
            <EyeIcon />
            {revealed ? 'Hide meaning' : 'Meaning'}
          </button>
        )}
      </header>
      <p className="turn-text" lang={canReveal ? language : undefined}>
        <Inline text={turn.text} />
      </p>
      {canReveal && reading?.text && (
        <p className="turn-reading" aria-label={`${languageName(language)} in Latin letters`}>
          {reading.text}
        </p>
      )}
      {revealed && (
        <p className={`turn-meaning${meaning?.error ? ' has-error' : ''}`}>
          {meaning?.loading ? 'Showing the meaning…' : (meaning?.text ?? meaning?.error ?? 'Meaning unavailable.')}
        </p>
      )}
    </article>
  )
})
