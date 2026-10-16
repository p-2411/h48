// A tile on the hub: a glass panel that opens its page. Its title is the button that opens it (for the
// keyboard and screen readers); a click anywhere else on it does too, except on its own controls.
// While its data loads it keeps its shape; if loading failed it says so in place, with Try again.
import type { ReactNode } from 'react'
import { Brush } from '../Brush'

export type TileId = 'today' | 'watching' | 'words' | 'talk'

export function Tile({
  id,
  title,
  aside,
  loaded = true,
  error,
  reload,
  onOpen,
  children
}: {
  id: TileId
  title: string
  /** Shown at the title's far end (a count, a badge). */
  aside?: ReactNode
  loaded?: boolean
  error?: string
  reload?: () => void
  onOpen: (tile: HTMLElement) => void
  children: ReactNode
}): React.JSX.Element {
  const tileOf = (element: Element): HTMLElement => element.closest<HTMLElement>('.tile')!
  return (
    <section
      className={`glass tile tile-${id}`}
      data-tile={id}
      aria-label={title}
      onClick={(event) => {
        if ((event.target as Element).closest('button, a, input, textarea, select, label')) return
        onOpen(tileOf(event.currentTarget))
      }}
    >
      <div className="tile-head">
        <button
          type="button"
          className="tile-title label"
          onClick={(event) => onOpen(tileOf(event.currentTarget))}
        >
          <Brush>{title}</Brush>
        </button>
        <span className="spacer" />
        {loaded && aside}
      </div>
      {!loaded && !error && <div className="tile-waiting" role="status" aria-label="Loading" />}
      {loaded && children}
      {/* Failed to load: in place of what it shows; failed to refresh: what it shows stays. */}
      {error && reload && (
        <p className="notice error row tile-error" role="alert">
          <span>{loaded ? `${error} This may be out of date.` : error}</span>
          <button type="button" className="btn quiet" onClick={reload}>
            Try again
          </button>
        </p>
      )}
    </section>
  )
}
