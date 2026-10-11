// The menu bar icon and its menu: Duet's way in when the overlay is hidden. Settings live in the
// strip's ⚙.
import { Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'

type Actions = {
  shortcut: string
  toggleOverlay: () => void
  showScript: () => void
  explainLine: () => void
  openTutor: () => void
  openCards: () => void
  openWelcome: () => void
}

export function createTray({
  shortcut,
  toggleOverlay,
  showScript,
  explainLine,
  openTutor,
  openCards,
  openWelcome
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
      { label: 'Talk about this line', click: openTutor },
      { label: 'My cards', click: openCards },
      { type: 'separator' },
      { label: 'Welcome and permissions…', click: openWelcome },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  return tray
}
