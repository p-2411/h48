// The menu bar icon and its menu: Duet's only presence outside the overlay. The menu also holds the
// settings that don't fit the overlay bar.
import { Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'
import type { Settings } from './settings'

type Actions = {
  shortcut: string
  toggleOverlay: () => void
  showScript: () => void
  explainLine: () => void
  openTutor: () => void
  openCards: () => void
  settings: Settings
}

export function createTray({
  shortcut,
  toggleOverlay,
  showScript,
  explainLine,
  openTutor,
  openCards,
  settings
}: Actions): Tray {
  const tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 18, height: 18 }))
  tray.setToolTip('Duet')
  const build = (): void =>
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
        {
          label: 'Pause while explaining',
          type: 'checkbox',
          checked: settings.current.pauseForHelp,
          click: (item) => settings.update({ pauseForHelp: item.checked })
        },
        { type: 'separator' },
        { label: 'Quit Duet', role: 'quit' }
      ])
    )
  build()
  settings.on('change', build)
  return tray
}
