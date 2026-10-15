// The menu bar icon and its menu: Duet's way in when the overlay is hidden, and to the home base
// (where Settings live; quick ones are also in the strip's ⚙). Duet's own updates have an item here
// too, once there is one to check or install (src/main/updates).
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { updateMenuItem } from '../shared/updates'
import type { Updates } from './updates'
import icon from '../../resources/icon.png?asset'
// On macOS, the Duet mark as a template (one colour, which macOS sets for a light or dark menu bar;
// the @2x beside it is loaded for Retina screens). Windows' tray shows the app icon.
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
  const tray = new Tray(
    process.platform === 'darwin' ? nativeImage.createFromPath(trayTemplate) : nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  )
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
        { label: 'Welcome and permissions…', click: openWelcome },
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
  return tray
}
