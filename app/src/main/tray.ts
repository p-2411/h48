// The menu bar icon and its menu: Duet's way in when the overlay is hidden, and to the home base
// (where Settings live; quick ones are also in the strip's ⚙).
import { Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'

type Actions = {
  openHome: () => void
  toggleOverlay: () => void
  showScript: () => void
  explainLine: () => void
  openCards: () => void
  openWelcome: () => void
}

export function createTray({
  openHome,
  toggleOverlay,
  showScript,
  explainLine,
  openCards,
  openWelcome
}: Actions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 18, height: 18 }))
  tray.setToolTip('Duet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Duet', click: openHome },
      { type: 'separator' },
      { label: 'Show or hide Duet', click: toggleOverlay },
      { label: 'Script', click: showScript },
      { label: 'Explain this line', click: explainLine },
      { label: 'Your words', click: openCards },
      { type: 'separator' },
      { label: 'Welcome and permissions…', click: openWelcome },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  return tray
}
