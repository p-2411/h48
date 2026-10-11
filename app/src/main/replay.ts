// Going back to a moment: in the open video, the player seeks to it; otherwise the video opens in
// the browser at that point.
import { shell } from 'electron'
import type { Moment } from '../shared/moment'
import type { Player } from './player'
import { sourceForSite } from './sources'
import type { Watcher } from './watcher'

export function replay(moment: Moment, { watcher, player }: { watcher: Watcher; player: Player }): void {
  const { site, id, position } = moment.video
  const source = sourceForSite(site)
  if (!source || !id || position === undefined) return
  const open = watcher.currentVideo
  if (open?.site === site && open.id === id && source.controls.seek) player.seek(position)
  else void shell.openExternal(source.linkAt(id, position))
}
