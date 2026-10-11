// Tokens written out as a line, each word coloured by its rung on the knowledge ladder (`state`;
// without it, new: white, and glue grey). Swapped words (in the other language) get a tint as well,
// and are written in their own script or their reading (`script`, a setting). With `onEnter`, words
// with a pair answer the pointer (the strip's word card).
import type { WordState } from '../../../shared/knowledge'
import { written } from '../../../shared/levels'
import type { Token, WordScript } from '../../../shared/types'

type LineToken = Token & { swapped?: boolean }

export function Words({
  tokens,
  state,
  script = 'native',
  onEnter,
  onLeave
}: {
  tokens: LineToken[]
  /** A word's rung (its colour), by its pair; none leaves it uncoloured. */
  state?: (pair: number | null, token: LineToken) => WordState | undefined
  /** How swapped-in words are written: their own script, or their reading. */
  script?: WordScript
  /** The pointer came onto a word that has a pair. */
  onEnter?: (token: LineToken & { pair: number }, element: HTMLElement) => void
  /** The pointer left it. */
  onLeave?: () => void
}): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => {
        const live = !!onEnter && token.pair !== null
        return (
          <span key={index}>
            <span
              className={`w${token.swapped ? ' sw' : ''}${live ? ' live' : ''}`}
              data-k={state ? state(token.pair, token) : token.pair === null ? 'ignored' : 'unknown'}
              onMouseEnter={live ? (event) => onEnter({ ...token, pair: token.pair! }, event.currentTarget) : undefined}
              onMouseLeave={live ? onLeave : undefined}
            >
              {token.swapped ? written(token, script) : token.text}
            </span>
            {token.space ? ' ' : ''}
          </span>
        )
      })}
    </>
  )
}
