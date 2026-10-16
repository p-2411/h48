import type { SplitKey, TileId, WorkspaceLayout } from '../../../shared/workspace'

/** A length as a share of the work area plus a fixed offset: calc(f × 100% + px). As in the
 * design, tiles are placed in shares, not pixels, so they always fill the area (even while the
 * window resizes) and CSS alone moves them. */
export type Len = { f: number; px: number }
export type Box = { x: Len; y: Len; w: Len; h: Len }
export type Rect = { x: number; y: number; width: number; height: number }
export type Divider = {
  key: SplitKey
  key2?: SplitKey
  axis: 'x' | 'y' | 'xy'
  at: number
  at2?: number
  from?: number
  to?: number
}

const len = (f: number, px = 0): Len => ({ f, px })
const box = (x: Len, y: Len, w: Len, h: Len): Box => ({ x, y, w, h })
/** Tiles sit 8px apart: each side of a split gives up 4px. */
const GAP = 4

/** A length in CSS, in `unit`s of the area: % for a tile, cqw/cqh for what sits inside one. */
export function css(l: Len, unit = '%'): string {
  return `calc(${+(l.f * 100).toFixed(4)}${unit} + ${l.px}px)`
}
export function toRect(b: Box, width: number, height: number): Rect {
  return {
    x: b.x.f * width + b.x.px,
    y: b.y.f * height + b.y.px,
    width: b.w.f * width + b.w.px,
    height: b.h.f * height + b.h.px
  }
}

export const FULL = box(len(0), len(0), len(1), len(1))

/** Where the open tiles go, where each waits on the hub, and the lines between them. */
export function tileRects(layout: WorkspaceLayout): {
  rects: Partial<Record<TileId, Box>>
  hub: Record<'today' | 'watching' | 'words', Box>
  dividers: Divider[]
} {
  const s = layout.split,
    dividers: Divider[] = [],
    rects: Partial<Record<TileId, Box>> = {}
  const hub = {
    today: box(len(0), len(0), len(s.hubCol, -GAP), len(1)),
    watching: box(len(s.hubCol, GAP), len(0), len(1 - s.hubCol, -GAP), len(s.hubRow, -GAP)),
    words: box(
      len(s.hubCol, GAP),
      len(s.hubRow, GAP),
      len(1 - s.hubCol, -GAP),
      len(1 - s.hubRow, -GAP)
    )
  }
  const others = layout.open.filter((id) => id !== 'talk'),
    talk = layout.open.includes('talk')
  if (!layout.open.length) {
    dividers.push(
      { key: 'hubCol', axis: 'x', at: s.hubCol },
      { key: 'hubRow', axis: 'y', at: s.hubRow, from: s.hubCol },
      { key: 'hubCol', key2: 'hubRow', axis: 'xy', at: s.hubCol, at2: s.hubRow }
    )
    return { rects, hub, dividers }
  }
  if (!others.length) {
    rects.talk = FULL
    return { rects, hub, dividers }
  }
  // Duet, when open beside others, takes a column on the right; the rest share what's left of it.
  const end = talk ? s.duet : 1,
    right = talk ? -GAP : 0
  if (talk) {
    rects.talk = box(len(end, GAP), len(0), len(1 - end, -GAP), len(1))
    dividers.push({ key: 'duet', axis: 'x', at: end })
  }
  if (others.length === 1) rects[others[0]] = box(len(0), len(0), len(end, right), len(1))
  else if (others.length === 2) {
    const key = layout.stacked ? (talk ? 'besideRow' : 'pairRow') : talk ? 'beside' : 'pair'
    if (layout.stacked) {
      const y = s[key]
      rects[others[0]] = box(len(0), len(0), len(end, right), len(y, -GAP))
      rects[others[1]] = box(len(0), len(y, GAP), len(end, right), len(1 - y, -GAP))
      dividers.push({ key, axis: 'y', at: y, from: 0, to: end })
      if (talk) dividers.push({ key: 'duet', key2: key, axis: 'xy', at: end, at2: y })
    } else {
      const x = end * s[key]
      rects[others[0]] = box(len(0), len(0), len(x, -GAP), len(1))
      rects[others[1]] = box(len(x, GAP), len(0), len(end - x, right - GAP), len(1))
      dividers.push({ key, axis: 'x', at: x })
    }
  } else {
    // Three: a main tile on the left and two stacked beside it; where the three meet, one handle
    // moves both lines at once.
    const col: SplitKey = talk ? 'main4' : 'main',
      row: SplitKey = talk ? 'stack4' : 'stack'
    const x = end * s[col],
      y = s[row]
    rects[others[0]] = box(len(0), len(0), len(x, -GAP), len(1))
    rects[others[1]] = box(len(x, GAP), len(0), len(end - x, right - GAP), len(y, -GAP))
    rects[others[2]] = box(len(x, GAP), len(y, GAP), len(end - x, right - GAP), len(1 - y, -GAP))
    dividers.push(
      { key: col, axis: 'x', at: x },
      { key: row, axis: 'y', at: y, from: x, to: end },
      { key: col, key2: row, axis: 'xy', at: x, at2: y }
    )
    if (talk) dividers.push({ key: 'duet', key2: row, axis: 'xy', at: end, at2: y })
  }
  return { rects, hub, dividers }
}
