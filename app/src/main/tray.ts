// The menu bar icon and its menu: Duet's way in when the overlay is hidden, and to the home base
// (where Settings live; quick ones are also in the strip's ⚙).
import { app, Menu, nativeImage, Tray } from 'electron'
import { darkSystemIcons, onIconAppearanceChanged } from './icons'
// On macOS, the Duet mark as a template (one colour, which macOS sets for a light or dark menu bar).
// Elsewhere, the small-size app icon, drawn for 16 px. The @2x beside each is loaded on high-DPI screens.
import trayLight from '../../resources/tray-light.png?asset'
import trayDark from '../../resources/tray-dark.png?asset'
import trayTemplate from '../../resources/trayTemplate.png?asset'

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
  const icon = (): Electron.NativeImage =>
    nativeImage.createFromPath(
      process.platform === 'darwin' ? trayTemplate : darkSystemIcons() ? trayDark : trayLight
    )
  const tray = new Tray(icon())
  const unsubscribe = onIconAppearanceChanged(() => {
    if (!tray.isDestroyed()) tray.setImage(icon())
  })
  app.once('will-quit', unsubscribe)
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
      { label: 'Replay the demo…', click: openWelcome },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  return tray
}
