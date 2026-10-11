// The voice tutor, main-process side: opens the tutor window on a moment and owns everything the
// tutor does outside the page (holding the video, and later the voice models in src/main/ai/voice).
//
// While the tutor is open the video is held, so the two voices never compete; closing the tutor
// releases it, and the video plays again only if it was playing before (see Player).
//
// IPC (all "tutor:*"; the page reaches them through window.duet.tutor in src/preload/tutor.ts):
//   tutor:get-moment  → the moment the tutor was opened on
//   tutor:moment      ← sent when the tutor is opened again on another moment
//   tutor:close       closes the window
import { ipcMain, type BrowserWindow } from 'electron'
import type { Moment } from '../../shared/moment'
import type { Player } from '../player'
import { createTutorWindow } from '../windows/tutor'

export class Tutor {
  private window?: BrowserWindow
  private moment?: Moment

  constructor(private player: Player) {
    ipcMain.handle('tutor:get-moment', () => this.moment)
    ipcMain.on('tutor:close', () => this.window?.close())
  }

  /** Opens the tutor on a moment, or moves an open tutor to it. */
  open(moment: Moment): void {
    this.moment = moment
    this.player.hold('tutor')
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('tutor:moment', moment)
      this.window.show()
      return
    }
    const window = (this.window = createTutorWindow())
    window.on('closed', () => {
      this.window = undefined
      this.player.release('tutor')
    })
  }
}
