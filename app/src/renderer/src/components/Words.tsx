// Tokens written out as a line, each word coloured by its rung on the knowledge ladder (`state`;
// without it, plain white). Swapped words (in the other language) get a tint as well.
import type { WordState } from '../../../shared/knowledge'
import type { Token } from '../../../shared/types'

export function Words({
  tokens,
  swapped,
  state
}: {
  tokens: (Token & { swapped?: boolean })[]
  swapped?: boolean
  /** A word's rung, by its pair (grammar words without a pair are grey). */
  state?: (pair: number | null) => WordState
}): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index}>
          <span className={`w${token.swapped || swapped ? ' sw' : ''}`} data-k={state ? state(token.pair) : token.pair === null ? 'ignored' : 'unknown'}>
            {token.text}
          </span>
          {token.space ? ' ' : ''}
        </span>
      ))}
    </>
  )
}
