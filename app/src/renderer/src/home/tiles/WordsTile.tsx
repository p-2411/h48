// Your words: how many words are on each rung of the ladder that counts (known, can say, can use),
// with a bar of the three, how many were met and are known, the words met most recently (each glowing in its rung's colour), and the
// cards due now with Review. It opens Your words.
import type { HomeToday } from '../../../../shared/home'
import { STATE_LABELS, type WordState } from '../../../../shared/knowledge'
import { metAndKnown, metAndKnownLine } from '../progress'
import { useLoaded } from '../useLoaded'
import { Tile } from './Tile'
import { useWordsSummary } from './useWordsSummary'

const RUNGS: WordState[] = ['known', 'speakable', 'usable']
// The recent words shown on the tile.
const RECENT = 8
const loadToday = (): Promise<HomeToday> => window.duet.home.getToday()

export function WordsTile({
  onOpen,
  onReview
}: {
  onOpen: (tile: HTMLElement) => void
  /** Opens Your words straight into Review. */
  onReview: (tile: HTMLElement) => void
}): React.JSX.Element {
  const { summary, error, reload } = useWordsSummary()
  const { value: today } = useLoaded(loadToday, 'Could not load the cards due.')
  const due = today?.due ?? 0
  const counted = summary ? RUNGS.reduce((sum, rung) => sum + summary.counts[rung], 0) : 0
  // Met: every rung but ignored, as "… met · … you know" counts them.
  const met = summary ? metAndKnown(summary.counts).met : 0
  return (
    <Tile
      id="words"
      title="Your words"
      aside={due > 0 && <span className="badge-due">{due} due</span>}
      loaded={!!summary}
      error={error}
      reload={reload}
      onOpen={onOpen}
    >
      {summary && met === 0 && (
        <p className="muted">
          {due > 0
            ? 'Review your cards, and the words they’re for start to climb.'
            : 'Words you meet while watching land here.'}
        </p>
      )}
      {summary && met > 0 && (
        <>
          <dl className="rungs">
            {RUNGS.map((rung) => (
              <div key={rung} className="rung">
                <dd className="w" data-k={rung}>
                  {summary.counts[rung]}
                </dd>
                <dt>{STATE_LABELS[rung]}</dt>
              </div>
            ))}
          </dl>
          {counted > 0 && (
            <div className="ladder-bar" aria-hidden="true">
              {RUNGS.map((rung) => (
                <span key={rung} data-k={rung} style={{ flexGrow: summary.counts[rung] }} />
              ))}
            </div>
          )}
          {counted > 0 && <p className="faint">{metAndKnownLine(summary.counts)}</p>}
          {counted === 0 && <p className="faint">{met} met so far. Review them and they climb.</p>}
          <p className="tile-recent" aria-label="Met most recently">
            {summary.words
              .filter((word) => word.state !== 'ignored')
              .slice(0, RECENT)
              .map((word) => (
                <span key={word.key} className="w" data-k={word.state}>
                  {word.word}
                </span>
              ))}
          </p>
        </>
      )}
      {summary && (
        <div className="row tile-foot">
          <button
            type="button"
            className="btn"
            disabled={due === 0}
            onClick={(event) => onReview(event.currentTarget.closest<HTMLElement>('.tile')!)}
          >
            {due > 0 ? `Review ${due}` : 'Nothing to review'}
          </button>
        </div>
      )}
    </Tile>
  )
}
