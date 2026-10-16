// One word, open on Your words' right: the word large in its rung colour, its reading and meaning
// (from its card), the ladder with its rung lit and what moves it up next, where it was met, its
// card or cards (CardView: edit, pause, delete, history), Ignore or Bring back, and Practise with
// Duet. A card whose word is not on the ladder shows just its card.
import { motion } from 'motion/react'
import type { CardDetail } from '../../../../shared/cards'
import { type WordState } from '../../../../shared/knowledge'
import { languageName } from '../../../../shared/languages'
import type { Language } from '../../../../shared/types'
import { CardView } from '../../cards/CardView'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { fadeUp } from '../../components/motion'
import { clock } from '../../components/time'
import type { WordItem } from './join'

const CLIMB: WordState[] = ['unknown', 'encountered', 'known', 'speakable', 'usable']
const RUNG_NAMES = ['New', 'Heard', 'Known', 'Can say', 'Can use']

// What moves a word up from its rung.
const NEXT: Partial<Record<WordState, string>> = {
  unknown: 'Meet it while watching to put it on the ladder.',
  encountered: 'Recall it right on two different days, or review its card.',
  known: 'Say it well on two different days.',
  speakable: 'Use it right in your own sentences, in two different contexts.',
  usable: 'At the top of the ladder.',
  ignored: 'Left out of colours and practice. Bring it back to climb again.'
}

// The colour a word's ladder is drawn in, up to where it is.
const RUNG_MARK: Record<WordState, string> = {
  unknown: 'var(--w-new)',
  encountered: 'var(--w-seen)',
  known: 'var(--w-known)',
  speakable: 'var(--w-say)',
  usable: 'var(--w-use)',
  ignored: 'var(--w-ignored)'
}

/** New › Heard › Known › Can say › Can use, with the word's rung lit. */

function Climb({ state }: { state: WordState }): React.JSX.Element {
  const at = CLIMB.indexOf(state)
  return (
    <ol
      className="yw-climb"
      aria-label="The ladder"
      style={{ '--c-at': RUNG_MARK[state] } as React.CSSProperties}
    >
      {CLIMB.map((step, index) => (
        <li
          key={step}
          data-k={step}
          className={index === at ? 'is-at' : index < at ? 'is-past' : undefined}
          aria-current={index === at ? 'step' : undefined}
        >
          <span>{RUNG_NAMES[index]}</span>
        </li>
      ))}
    </ol>
  )
}

/** Where it was met: the videos its cards were saved from. */
function metIn(row: WordItem): string[] {
  const places = new Set<string>()
  for (const card of row.cards) {
    if (card.source.kind !== 'video') continue
    const { video } = card.source.moment
    places.add(
      `${video.title ?? video.site}${video.position !== undefined ? `, at ${clock(video.position)}` : ''}`
    )
  }
  return [...places]
}

export function WordDetail({
  row,
  language,
  cards,
  cardsError,
  onIgnore,
  onPractise,
  onDeleted,
  onSavedAsNew
}: {
  row: WordItem
  language: Language
  /** Its cards in full; undefined while they load. */
  cards?: CardDetail[]
  cardsError?: string
  onIgnore: (ignored: boolean) => void
  onPractise: () => void
  onDeleted: (id: string, expression: string) => void
  onSavedAsNew: (id: string) => void
}): React.JSX.Element {
  const first = row.cards[0]
  const places = metIn(row)
  const seenAs =
    row.seenAs && row.seenAs.toLocaleLowerCase() !== row.text.toLocaleLowerCase()
      ? row.seenAs
      : undefined
  return (
    <section className="glass yw-detail" aria-labelledby="yw-detail-word">
      {/* Each word fades and rises in as it's picked. */}
      <motion.div key={row.key} className="yw-detail-body" {...fadeUp()}>
        <header className="yw-word">
          <p id="yw-detail-word" className="yw-big">
            <span className="w" data-k={row.state ?? 'unknown'} lang={row.language ?? language}>
              {row.text}
            </span>
          </p>
          {first && (first.reading || first.meaning) && (
            <p className="muted">
              {first.reading && <span lang={row.language ?? language}>{first.reading}</span>}
              {first.reading && first.meaning && ' Â· '}
              {first.meaning}
            </p>
          )}
        </header>
        {row.state ? (
          <>
            {row.state !== 'ignored' && <Climb state={row.state} />}
            <p className="faint yw-next">{NEXT[row.state]}</p>
          </>
        ) : row.language ? (
          <p className="faint yw-next">
            A {languageName(row.language)} card. Youâ€™re learning {languageName(language)} now, so
            it isnâ€™t on this ladder; it still comes up in Review.
          </p>
        ) : (
          <p className="faint yw-next">
            A card of your own. It isnâ€™t a word on the ladder, so it has no rung.
          </p>
        )}
        {(seenAs || places.length > 0) && (
          <dl className="yw-facts">
            {seenAs && (
              <>
                <dt>Seen as</dt>
                <dd lang={language}>{seenAs}</dd>
              </>
            )}
            {places.length > 0 && (
              <>
                <dt>Met in</dt>
                <dd>{places.join('; ')}</dd>
              </>
            )}
          </dl>
        )}
        <div className="row">
          {/* Talk is in the language learnt now, so a card in another one isn't practised there. */}
          {!row.language && (
            <button type="button" className="btn primary" onClick={onPractise}>
              Practise with Duet
            </button>
          )}
          {row.state && (
            <button
              type="button"
              className="btn quiet"
              onClick={() => onIgnore(row.state !== 'ignored')}
            >
              {row.state === 'ignored' ? 'Bring back' : 'Ignore'}
            </button>
          )}
        </div>
        {row.cards.length > 0 && (
          <div className="yw-cards">
            <h2 className="label">
              {row.cards.length === 1 ? 'Its card' : `Its cards (${row.cards.length})`}
            </h2>
            {cardsError && (
              <p className="notice error" role="alert">
                {cards ? `${cardsError} Whatâ€™s shown may be out of date.` : cardsError}
              </p>
            )}
            {!cards
              ? !cardsError && (
                  <p className="faint" role="status">
                    Loadingâ€¦
                  </p>
                )
              : cards.map((card) => (
                  // A card that breaks takes only itself down; the word and the list go on.
                  <ErrorBoundary key={card.id} what="This card">
                    <div className="yw-card">
                      <CardView card={card} onDeleted={onDeleted} onSavedAsNew={onSavedAsNew} />
                    </div>
                  </ErrorBoundary>
                ))}
          </div>
        )}
      </motion.div>
    </section>
  )
}
