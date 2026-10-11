// Tokens written out as a line, each word coloured by its job. Swapped words (in the other
// language) get a tint as well.
import type { Token } from '../../../shared/types'

export function Words({ tokens, swapped }: { tokens: (Token & { swapped?: boolean })[]; swapped?: boolean }): React.JSX.Element {
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index}>
          <span className={`w${token.swapped || swapped ? ' sw' : ''}`} data-t={token.job}>
            {token.text}
          </span>
          {token.space ? ' ' : ''}
        </span>
      ))}
    </>
  )
}
