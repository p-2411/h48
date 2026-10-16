// Collections: each one a little pile of index cards with a real word on top (click the pile to
// review it), and By video: each video's still with its line, its words in their highlighter, and
// Review. The piles show only once there's more than one; bringing in an Anki deck comes later.
import { Icon } from '../../components/Icon'
import type { CollectionView, VideoGroup } from '../../../../shared/flashcards'
import { icons } from './bits'

// The sheets under the top card sit a little askew, the way a real pile does.
const ANGLES = [
  'rotate(2.2deg) translate(5px, 3px)',
  'rotate(-2.6deg) translate(-4px, 5px)',
  'rotate(4deg) translate(8px, 7px)'
]

function Pile({
  pile,
  onReview
}: {
  pile: CollectionView
  onReview: () => void
}): React.JSX.Element {
  // A bigger collection is a taller pile.
  const under = Math.min(3, 1 + Math.floor(Math.log10(Math.max(1, pile.cards))))
  return (
    <button
      type="button"
      className="fc-stack"
      disabled={!pile.due}
      onClick={onReview}
      aria-label={`${pile.name}: ${pile.due ? `review ${pile.due}` : 'nothing due today'}`}
    >
      <span className="fc-pile">
        {ANGLES.slice(0, under)
          .reverse()
          .map((angle) => (
            <span key={angle} className="fc-sheet" style={{ transform: angle }} />
          ))}
        <span className="fc-sheet top">
          {pile.top && (
            <>
              <span className="hw-mini mark" data-step={pile.top.step}>
                {pile.top.word}
              </span>
              <span className="mean">{pile.top.meaning}</span>
            </>
          )}
        </span>
      </span>
      <span className="fc-stack-name">{pile.name}</span>
      <span className="fc-stack-meta">
        {pile.due ? <b>{pile.due} to review</b> : 'All done today'} · {pile.cards.toLocaleString()}{' '}
        {pile.cards === 1 ? 'card' : 'cards'}
      </span>
    </button>
  )
}

function watched(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days < 1) return 'Watched today'
  if (days < 2) return 'Watched yesterday'
  if (days < 7) return `Watched ${days} days ago`
  if (days < 14) return 'Watched last week'
  return `Watched ${Math.floor(days / 7)} weeks ago`
}

export function Collections({
  piles,
  videos,
  onReviewPile,
  onReviewVideo,
  onAnki,
  onMake
}: {
  piles?: CollectionView[]
  videos?: VideoGroup[]
  onReviewPile: (id: string) => void
  onReviewVideo: (id: string) => void
  onAnki: () => void
  /** Make a card by hand, for a word not met in a video. */
  onMake: () => void
}): React.JSX.Element {
  if (!piles || !videos) return <div className="fc-cols" />
  const shown = 4
  return (
    <div className="fc-cols" data-tour="collections">
      {/* A plus that slides out to "Make a card" when pointed at. */}
      <button type="button" className="fc-add-card" aria-label="Make a card" onClick={onMake}>
        <Icon name="plus" size={16} />
        <span className="fc-add-card-label" aria-hidden="true">
          Make a card
        </span>
      </button>
      {piles.length > 1 && (
        <section>
          <div className="fc-cols-head">
            <h2>Collections</h2>
            <span>Your daily review mixes them all. Pick a pile to focus on it.</span>
            <button type="button" className="fc-text-link" onClick={onAnki}>
              Bring in an Anki deck
            </button>
          </div>
          <div className="fc-stacks">
            {piles.map((pile) => (
              <Pile key={pile.id} pile={pile} onReview={() => onReviewPile(pile.id)} />
            ))}
          </div>
        </section>
      )}
      <section>
        <div className="fc-cols-head">
          <h2>By video</h2>
          <span>Go over a video’s words before the next episode.</span>
          {piles.length <= 1 && (
            <button type="button" className="fc-text-link" onClick={onAnki}>
              Bring in an Anki deck
            </button>
          )}
        </div>
        {videos.length ? (
          <div className="fc-vids">
            {videos.map((video) => (
              <article className="fc-vid" key={video.id}>
                <div className="fc-vid-shot">
                  {video.line && (
                    <div className="sub-line">
                      <span>{video.line}</span>
                    </div>
                  )}
                </div>
                <div className="fc-vid-body">
                  <b>{video.title}</b>
                  <span className="fc-vid-meta">
                    {watched(video.watched)} · {video.words.length}{' '}
                    {video.words.length === 1 ? 'word' : 'words'}
                  </span>
                  <p className="fc-vid-words">
                    {video.words.slice(0, shown).map((item, index) => (
                      <span key={item.word}>
                        {index > 0 && ', '}
                        <span className="mark" data-step={item.step}>
                          {item.word}
                        </span>
                      </span>
                    ))}
                    {video.words.length > shown && (
                      <span className="and"> and {video.words.length - shown} more</span>
                    )}
                  </p>
                </div>
                {video.due ? (
                  <button type="button" className="fc-go" onClick={() => onReviewVideo(video.id)}>
                    Review {video.due}
                    {icons.arrow}
                  </button>
                ) : (
                  <span className="fc-go-none">All done</span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="fc-empty">
            Words you keep while watching gather here, by the video they came from.
          </p>
        )}
      </section>
    </div>
  )
}
