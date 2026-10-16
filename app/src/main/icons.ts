// The locked mark in docs/brand/icons.md. System chrome follows the OS appearance,
// independently of Duet's deliberately dark caption surfaces.
import { app, BrowserWindow, nativeTheme, systemPreferences } from 'electron'
import lightWindows from '../../resources/icon-light.ico?asset'
import darkWindows from '../../resources/icon-dark.ico?asset'
import lightLinux from '../../resources/icon-light.png?asset'
import darkLinux from '../../resources/icon-dark.png?asset'
import lightDock from '../../resources/dock-light.png?asset'
import darkDock from '../../resources/dock-dark.png?asset'

export function darkSystemIcons(): boolean {
  if (process.platform === 'darwin') {
    // nativeTheme is forced dark for the caption material; read the actual OS choice.
    return systemPreferences.getUserDefault('AppleInterfaceStyle', 'string') === 'Dark'
  }
  if (process.platform === 'win32') return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
  return nativeTheme.shouldUseDarkColors
}

export function onIconAppearanceChanged(update: () => void): () => void {
  nativeTheme.on('updated', update)
  const notification =
    process.platform === 'darwin'
      ? systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', update)
      : undefined
  return () => {
    nativeTheme.off('updated', update)
    if (notification !== undefined) systemPreferences.unsubscribeNotification(notification)
  }
}

export function installAppIcons(): void {
  const setWindowIcon = (window: BrowserWindow): void => {
    if (process.platform === 'darwin' || window.isDestroyed()) return
    const dark = darkSystemIcons()
    window.setIcon(
      process.platform === 'win32'
        ? dark
          ? darkWindows
          : lightWindows
        : dark
          ? darkLinux
          : lightLinux
    )
  }
  const update = (): void => {
    if (process.platform === 'darwin') app.dock?.setIcon(darkSystemIcons() ? darkDock : lightDock)
    for (const window of BrowserWindow.getAllWindows()) setWindowIcon(window)
  }
  const created = (_event: Electron.Event, window: BrowserWindow): void => setWindowIcon(window)
  app.on('browser-window-created', created)
  const unsubscribe = onIconAppearanceChanged(update)
  update()
  app.once('will-quit', () => {
    unsubscribe()
    app.off('browser-window-created', created)
  })
}
