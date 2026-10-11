// All cards: search, filters, and the list (newest first).
import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import type { CardQuery } from '../../../shared/cards'
import { DURATION, EASE_IN, EASE_OUT, GLIDING } from '../components/motion'
import { stateLabel } from './labels'
import type { CardLibrary } from './useCardLibrary'

const SHOW: { value: NonNullable<CardQuery['show']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'due', label: 'Due' },
  { value: 'paused', label: 'Paused' }
]

export function CardList({ library }: { library: CardLibrary }): React.JSX.Element {
  const { cards, query, setQuery: onQuery, selected, setSelected: onSelect, error, retry } = library
  const filtered = !!(query.search || (query.show && query.show !== 'all') || query.type)
  const search = useRef<HTMLInputElement>(null)
  // The Clear button goes away with the filters, so focus goes to the (now empty) search.
  const clear = (): void => {
    onQuery({ show: 'all' })
    search.current?.focus()
  }
  return (
    <aside className="list">
      <input
        ref={search}
        className="search"
        type="search"
        aria-label="Search cards"
        placeholder="Search expressions, meanings, notes"
        value={query.search ?? ''}
        onChange={(event) => onQuery({ ...query, search: event.target.value })}
      />
      <div className="row">
        <div className="segment" role="group" aria-label="Show">
          {SHOW.map((item) => (
            <button key={item.value} type="button" aria-pressed={(query.show ?? 'all') === item.value} onClick={() => onQuery({ ...query, show: item.value })}>
              {item.label}
            </button>
          ))}
        </div>
        <select
          className="type"
          aria-label="Card type"
          value={query.type ?? ''}
          onChange={(event) => onQuery({ ...query, type: (event.target.value || undefined) as CardQuery['type'] })}
        >
          <option value="">Any type</option>
          <option value="understand">Understand</option>
          <option value="use">Use it</option>
        </select>
      </div>
      {/* A failed load says so; a failed refresh keeps the cards shown, and says they may be out of date. */}
      {error && (
        <div className="notice error row" role="alert">
          <span>{cards ? `${error} What’s shown may be out of date.` : error}</span>
          <button type="button" className="btn quiet" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {error && !cards ? null : !cards ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : cards.length === 0 ? (
        filtered ? (
          <div className="faint row">
            <span>No cards match.</span>
            <button type="button" className="btn quiet" onClick={clear}>
              Clear search and filters
            </button>
          </div>
        ) : (
          <p className="faint">No cards yet. Save one from Explain.</p>
        )
      ) : (
        <ul>
          {/* A card deleted collapses out, one brought back comes in; the selection glides to the card picked. */}
          <AnimatePresence initial={false}>
          {cards.map((card) => (
            <motion.li
              key={card.id}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto', transition: { duration: DURATION.base, ease: EASE_OUT } }}
              exit={{ opacity: 0, height: 0, transition: { duration: DURATION.base * 0.7, ease: EASE_IN } }}
            >
              <button type="button" className={`item${card.id === selected ? ' is-on' : ''}`} onClick={() => onSelect(card.id)}>
                {card.id === selected && <motion.span layoutId="card-selected" className="item-selected" transition={GLIDING} aria-hidden="true" />}
                <span className="expression" lang={card.language}>
                  {card.expression}
                </span>
                <span className="faint">{card.meaning}</span>
                <span className="badge">{stateLabel(card)}</span>
              </button>
            </motion.li>
          ))}
          </AnimatePresence>
        </ul>
      )}
    </aside>
  )
}
