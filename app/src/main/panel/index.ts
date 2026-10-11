// The side panel, main-process side: one window beside the video with tabs. Script lists every line
// of the video (the whole transcript when there is one) and follows the video; clicking a line goes
// back to it. Explain is src/main/explain, shown in this window. The window remembers where the
// learner leaves it, and its size.
//
// IPC (all "panel:*"; the page reaches them through window.duet.panel in src/preload/panel.ts):
//   panel:get-state    → { tab, script, current }
//   panel:tab / panel:script / panel:script-line / panel:current   ← updates
//   panel:set-tab      the learner switched tabs
//   panel:seek         goes back to a line
import { EventEmitter } from 'events'
import { ipcMain, type BrowserWindow } from 'electron'
import type { Moment } from '../../shared/moment'
import type { PanelTab } from '../../shared/types'
import type { Settings } from '../settings'
import type { Watcher } from '../watcher'
import { isFrom } from '../windows/from'
import { createPanelWindow } from '../windows/panel'

export class Panel extends EventEmitter {
  private window?: BrowserWindow
  private tab: PanelTab = 'script'

  constructor(
    private readonly options: { watcher: Watcher; settings: Settings; replay: (moment: Moment) => void }
  ) {
    super()
    const { watcher, replay } = options
    ipcMain.handle('panel:get-state', () => ({ tab: this.tab, script: watcher.script, current: watcher.currentLine?.id ?? null }))
    ipcMain.on('panel:set-tab', (_, tab: PanelTab) => (this.tab = tab))
    ipcMain.on('panel:seek', (_, lineId: number) => {
      const moment = watcher.moment(lineId)
      if (moment) replay(moment)
    })
    watcher.on('script', (script) => this.send('panel:script', script))
    watcher.on('script-line', (line) => this.send('panel:script-line', line))
    watcher.on('current', (id) => this.send('panel:current', id))
  }

  /** Opens the panel (or brings it forward) on a tab. */
  show(tab: PanelTab): void {
    this.tab = tab
    if (!this.window || this.window.isDestroyed()) {
      const window = (this.window = createPanelWindow(this.options.settings.current.panelBounds))
      // Saved once the learner stops moving or resizing it.
      let saving: NodeJS.Timeout | undefined
      const save = (): void => {
        clearTimeout(saving)
        saving = setTimeout(() => window.isDestroyed() || this.options.settings.update({ panelBounds: window.getBounds() }), 400)
      }
      window.on('moved', save)
      window.on('resized', save)
      window.on('closed', () => {
        clearTimeout(saving)
        this.window = undefined
        this.emit('closed')
      })
    } else {
      this.window.show()
      this.send('panel:tab', tab)
    }
  }

  /** Whether a message came from the panel's page (the only page allowed to talk to the tutor). */
  owns(sender: Electron.WebContents): boolean {
    return isFrom(this.window, sender)
  }

  send(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, payload)
  }
}
