// The menu bar icon and its menu: Duet's only presence outside the overlay.
import { Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'

type Actions = {
  shortcut: string
  toggleOverlay: () => void
  showScript: () => void
  explainLine: () => void
  openTutor: () => void
  openCards: () => void
}

export function createTray({
  shortcut,
  toggleOverlay,
  showScript,
  explainLine,
  openTutor,
  openCards
}: Actions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 18, height: 18 }))
  tray.setToolTip('Duet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Show or hide (${shortcut.replace('Alt', process.platform === 'darwin' ? 'Option' : 'Alt')})`,
        click: toggleOverlay
      },
      { label: 'Script', click: showScript },
      { label: 'Explain this line', click: explainLine },
      { label: 'Converse about this line', click: openTutor },
      { label: 'My cards', click: openCards },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  return tray
}
