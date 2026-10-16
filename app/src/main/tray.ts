// The menu bar icon and its menu: Duet's way in when the overlay is hidden, and to the home base
// (where Settings live; quick ones are also in the strip's ⚙). Duet's own updates have an item here
// too, once there is one to check or install (src/main/updates).
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { updateMenuItem } from '../shared/updates'
import { darkSystemIcons, onIconAppearanceChanged } from './icons'
import type { Updates } from './updates'
// On macOS, the Duet mark as a template (one colour, which macOS sets for a light or dark menu bar).
// Elsewhere, the small-size app icon drawn for 16 px, light or dark as the system is. The @2x beside
// each is loaded on high-DPI screens.
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
  updates: Updates
}

export function createTray({
  openHome,
  toggleOverlay,
  showScript,
  explainLine,
  openCards,
  openWelcome,
  updates
}: Actions): Tray {
  const windows = process.platform === 'win32'
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
  const build = (): void => {
    const update = updateMenuItem(updates.status.state)
    const updateItems: MenuItemConstructorOptions[] = update
      ? [
          {
            ...update,
            click: () => (updates.status.state.kind === 'ready' ? updates.restart() : updates.check({ tell: true }))
          },
          { type: 'separator' }
        ]
      : []
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
        ...updateItems,
        { label: 'Quit Duet', role: 'quit' }
      ])
    )
  }
  build()
  // The menu shows a download's version, not its progress: rebuilt only when the item changes.
  let shown = JSON.stringify(updateMenuItem(updates.status.state))
  updates.on('change', ({ state }) => {
    const next = JSON.stringify(updateMenuItem(state))
    if (next === shown) return
    shown = next
    build()
  })
  // On Windows a left click opens Duet (the menu is on the right click), as tray icons there do.
  if (windows) tray.on('click', openHome)
  return tray
}
