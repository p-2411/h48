// The menu bar icon and its menu: Duet's way in when the overlay is hidden, and to the home base
// (where Settings live; quick ones are also in the strip's ⚙).
import { Menu, nativeImage, Tray } from 'electron'
// On macOS, the Duet mark as a template (one colour, which macOS sets for a light or dark menu bar;
// the @2x beside it is loaded for Retina screens). Windows' tray shows the app icon, from an .ico
// with each size Windows picks from (16 to 256 px), so it stays sharp at any display scaling.
import trayTemplate from '../../resources/trayTemplate.png?asset'
import trayIcon from '../../resources/tray.ico?asset'

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
  const windows = process.platform === 'win32'
  const tray = new Tray(nativeImage.createFromPath(windows ? trayIcon : trayTemplate))
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
      // Windows asks for no permissions.
      { label: windows ? 'Welcome…' : 'Welcome and permissions…', click: openWelcome },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )
  // On Windows a left click opens Duet (the menu is on the right click), as tray icons there do.
  if (windows) tray.on('click', openHome)
  return tray
}
