// Your words' left column: the search, the filters (a segment for which rows, a menu for the rung)
// and the list. Each row: the word in its rung colour, its card's meaning (or the form it was seen
// as), and its rung, or an orange "due" when its card is due.
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { STATE_LABELS, type WordState } from '../../../../shared/knowledge'
import { languageName } from '../../../../shared/languages'
import type { Language } from '../../../../shared/types'
import { GLIDING } from '../../components/motion'
import type { WordFilter, WordItem } from './join'

const SHOW: { value: WordFilter['show']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'card', label: 'Has a card' },
  { value: 'paused', label: 'Paused' }
]
const RUNGS: WordState[] = ['unknown', 'encountered', 'known', 'speakable', 'usable', 'ignored']

/** The row's second line: its card's meaning, or the form it was seen as when that differs. */
function subline(row: WordItem): string | undefined {
  if (row.cards.length) return row.cards[0].meaning
  if (row.seenAs && row.seenAs.toLocaleLowerCase() !== row.text.toLocaleLowerCase())
    return `Seen as “${row.seenAs}”`
  return undefined
}

function Row({
  row,
  language,
  on,
  onPick
}: {
  row: WordItem
  language: Language
  on: boolean
  onPick: () => void
}): React.JSX.Element {
  const sub = subline(row)
  return (
    <li>
      <button
        type="button"
        className={`yw-row${on ? ' is-on' : ''}`}
        aria-current={on ? 'true' : undefined}
        data-key={row.key}
        onClick={onPick}
      >
        {on && (
          <motion.span
            layoutId="yw-selected"
            className="yw-row-selected"
            transition={GLIDING}
            aria-hidden="true"
          />
        )}
        <span className="yw-row-word">
          <span className="w" data-k={row.state ?? 'unknown'} lang={row.language ?? language}>
            {row.text}
          </span>
        </span>
        {sub && (
          <span className="yw-row-sub" lang={row.cards.length ? undefined : language}>
            {sub}
          </span>
        )}
        {row.due ? (
          <span className="yw-row-rung yw-due">due</span>
        ) : (
          <span className="yw-row-rung" data-k={row.state}>
            {row.state ? STATE_LABELS[row.state] : row.language ? `${languageName(row.language)} card` : 'Card'}
          </span>
        )}
      </button>
    </li>
  )
}

export function WordList({
  rows,
  language,
  counts,
  filter,
  onFilter,
  selected,
  onSelect,
  more
}: {
  /** The rows that match the filter. */
  rows: WordItem[]
  language: Language
  counts: Record<WordState, number>
  filter: WordFilter
  onFilter: (filter: WordFilter) => void
  selected?: string
  onSelect: (key: string) => void
  /** Said under the list (the list is the words met most recently). */
  more?: string
}): React.JSX.Element {
  const search = useRef<HTMLInputElement>(null)
  const filtered = !!(filter.search?.trim() || filter.show !== 'all' || filter.rung)
  // The Clear button goes away with the filters, so focus goes to the (now empty) search.
  const clear = (): void => {
    onFilter({ show: 'all' })
    search.current?.focus()
  }
  // The row picked from elsewhere (a card main asked to show) scrolls into view.
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (!selected) return
    list.current
      ?.querySelector(`[data-key="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <aside className="yw-side" aria-label="Words">
      <div className="yw-find">
        <input
          ref={search}
          className="search"
          type="search"
          aria-label="Search your words"
          placeholder="Search"
          value={filter.search ?? ''}
          onChange={(event) => onFilter({ ...filter, search: event.target.value })}
        />
        <select
          className="yw-rung-pick"
          aria-label="Rung"
          value={filter.rung ?? ''}
          onChange={(event) =>
            onFilter({
              ...filter,
              rung: (event.target.value || undefined) as WordState | undefined
            })
          }
        >
          <option value="">Every rung</option>
          {RUNGS.map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]} ({counts[state]})
            </option>
          ))}
        </select>
      </div>
      <div className="segment yw-show" role="group" aria-label="Show">
        {SHOW.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter.show === item.value}
            onClick={() => onFilter({ ...filter, show: item.value })}
          >
            {item.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="faint row yw-none">
          <span>{filtered ? 'No words match.' : 'No words here yet.'}</span>
          {filtered && (
            <button type="button" className="btn quiet" onClick={clear}>
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <ul className="yw-list" ref={list}>
          {rows.map((row) => (
            <Row
              key={row.key}
              row={row}
              language={language}
              on={row.key === selected}
              onPick={() => onSelect(row.key)}
            />
          ))}
        </ul>
      )}
      {more && <p className="faint yw-more">{more}</p>}
    </aside>
  )
}
