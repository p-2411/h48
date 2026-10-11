// The menu bar icon and its menu: Duet's only presence outside the overlay.
import { Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'

export function createTray({ shortcut, toggleOverlay, openTutor }: { shortcut: string; toggleOverlay: () => void; openTutor: () => void }): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 18, height: 18 }))
  tray.setToolTip('Duet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Show or hide (${shortcut.replace('Alt', process.platform === 'darwin' ? 'Option' : 'Alt')})`, click: toggleOverlay },
      { label: 'Talk about this line', click: openTutor },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  return tray
}
