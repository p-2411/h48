// All cards: search, filters, and the list (newest first).
import { useRef } from 'react'
import type { CardQuery } from '../../../shared/cards'
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
      {error ? (
        <div className="notice error row" role="alert">
          <span>{error}</span>
          <button type="button" className="btn quiet" onClick={retry}>
            Try again
          </button>
        </div>
      ) : !cards ? (
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
          {cards.map((card) => (
            <li key={card.id}>
              <button type="button" className={`item${card.id === selected ? ' is-on' : ''}`} onClick={() => onSelect(card.id)}>
                <span className="expression" lang={card.language}>
                  {card.expression}
                </span>
                <span className="faint">{card.meaning}</span>
                <span className="badge">{stateLabel(card)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
