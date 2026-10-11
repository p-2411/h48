// Talk to Duet: the mascot, one nudge (a word the learner can say but not use yet, the most recently
// seen; otherwise an open invitation) and a message box. Sending grows the tile into Talk with the
// message sent; the mic grows it into Talk with voice on.
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/Mascot'
import { Tile } from './Tile'
import { useWordsSummary } from './useWordsSummary'

export type TalkStart = { first?: string; voice?: boolean }

export function TalkTile({
  onOpen
}: {
  onOpen: (tile: HTMLElement, start?: TalkStart) => void
}): React.JSX.Element {
  const { summary } = useWordsSummary()
  const [draft, setDraft] = useState('')
  const word = summary?.words.find((entry) => entry.state === 'speakable')
  const tileOf = (element: Element): HTMLElement => element.closest<HTMLElement>('.tile')!
  const send = (element: Element): void => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    onOpen(tileOf(element), { first: text })
  }
  return (
    <Tile id="talk" title="Talk to Duet" onOpen={(tile) => onOpen(tile)}>
      <div className="talk-tile-who">
        <Mascot state="idle" scale={0.2} opening={false} />
        <p className="muted">
          {word ? (
            <>
              Want to try{' '}
              <span className="w" data-k={word.state}>
                {word.word}
              </span>{' '}
              in a sentence?
            </>
          ) : (
            'Ask anything, or just chat.'
          )}
        </p>
      </div>
      <form
        className="tile-composer"
        onSubmit={(event) => {
          event.preventDefault()
          send(event.currentTarget)
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something…"
          aria-label="Message to Duet"
        />
        <button
          type="button"
          className="tile-mic"
          aria-label="Talk to Duet out loud"
          onClick={(event) => onOpen(tileOf(event.currentTarget), { voice: true })}
        >
          <Icon name="mic" size={14} />
        </button>
        <button type="submit" className="tile-send" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </Tile>
  )
}
