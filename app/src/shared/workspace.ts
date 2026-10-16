export type TileId = 'today' | 'watching' | 'words' | 'talk'
export type Appearance = 'light' | 'dark' | 'system'
export const TILES: TileId[] = ['today', 'watching', 'words', 'talk']
export const DEFAULT_SPLIT = {
  hubCol: 0.53,
  hubRow: 0.5,
  pair: 0.5,
  pairRow: 0.5,
  duet: 0.64,
  beside: 0.53,
  besideRow: 0.5,
  main: 0.56,
  stack: 0.5,
  main4: 0.5,
  stack4: 0.5
}
export type SplitKey = keyof typeof DEFAULT_SPLIT
export type WorkspaceLayout = {
  open: TileId[]
  split: typeof DEFAULT_SPLIT
  stacked: boolean
  floating: boolean
  corner: 'tl' | 'tr' | 'bl' | 'br'
}
export const defaultLayout = (): WorkspaceLayout => ({
  open: [],
  split: { ...DEFAULT_SPLIT },
  stacked: false,
  floating: false,
  corner: 'br'
})
export const clampSplit = (value: number): number => Math.max(0.22, Math.min(0.78, value))
export function cleanLayout(input: unknown): WorkspaceLayout {
  const out = defaultLayout()
  if (!input || typeof input !== 'object') return out
  const value = input as Partial<WorkspaceLayout>
  if (Array.isArray(value.open))
    out.open = TILES.filter((id) => value.open!.includes(id)).sort(
      (a, b) => value.open!.indexOf(a) - value.open!.indexOf(b)
    )
  if (out.open.includes('talk')) out.open = [...out.open.filter((id) => id !== 'talk'), 'talk']
  for (const key of Object.keys(DEFAULT_SPLIT) as SplitKey[]) {
    const number = value.split?.[key]
    if (typeof number === 'number' && Number.isFinite(number)) out.split[key] = clampSplit(number)
  }
  out.stacked = value.stacked === true
  out.floating = value.floating === true
  if (['tl', 'tr', 'bl', 'br'].includes(value.corner ?? '')) out.corner = value.corner!
  if (out.floating) out.open = out.open.filter((id) => id !== 'watching')
  return out
}
export function tileLimit(width: number): number {
  return width < 820 ? 2 : width < 960 ? 3 : 4
}
export function fitTiles(open: TileId[], width: number): TileId[] {
  const talk = open.includes('talk')
  const others = open.filter((id) => id !== 'talk').slice(0, tileLimit(width) - Number(talk))
  return talk ? [...others, 'talk'] : others
}
export function openTile(layout: WorkspaceLayout, id: TileId, width: number): WorkspaceLayout {
  const talk = id === 'talk' || layout.open.includes('talk')
  let others = layout.open.filter((x) => x !== 'talk')
  if (id !== 'talk') {
    if (others.includes(id)) others = [id, ...others.filter((x) => x !== id)]
    else {
      const space = tileLimit(width) - Number(talk)
      if (others.length >= space) others = others.slice(0, space - 1)
      others.push(id)
    }
  }
  return {
    ...layout,
    floating: id === 'watching' ? false : layout.floating,
    open: fitTiles(talk ? [...others, 'talk'] : others, width)
  }
}
/** Shows `id` in place of the open places (Talk's chat stays beside it, as it is). openTile puts
 * it beside them instead. */
export function switchTile(layout: WorkspaceLayout, id: TileId, width: number): WorkspaceLayout {
  if (id === 'talk') return openTile(layout, id, width)
  const talk = layout.open.includes('talk')
  return openTile({ ...layout, open: talk ? ['talk'] : [] }, id, width)
}
export type HomePreferences = { appearance: Appearance; layout: WorkspaceLayout }
export type HomeView = HomePreferences & { dark: boolean; platform: string }
