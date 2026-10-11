// All cards: search, filters, and the list (newest first).
import type { Card, CardQuery } from '../../../shared/cards'
import { stateLabel } from './labels'

const SHOW: { value: NonNullable<CardQuery['show']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'due', label: 'Due' },
  { value: 'paused', label: 'Paused' }
]

export function CardList({
  cards,
  query,
  onQuery,
  selected,
  onSelect
}: {
  cards: Card[]
  query: CardQuery
  onQuery: (query: CardQuery) => void
  selected?: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <aside className="list">
      <input
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
        <div className="segment" role="group" aria-label="Card type">
          {([undefined, 'understand', 'use'] as const).map((type) => (
            <button key={type ?? 'any'} type="button" aria-pressed={query.type === type} onClick={() => onQuery({ ...query, type })}>
              {type === 'understand' ? 'Understand' : type === 'use' ? 'Use it' : 'Any type'}
            </button>
          ))}
        </div>
      </div>
      {cards.length === 0 ? (
        <p className="faint">{query.search || (query.show && query.show !== 'all') || query.type ? 'No cards match.' : 'No cards yet. Save one from Explain.'}</p>
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
