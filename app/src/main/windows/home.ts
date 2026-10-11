// The home base: an ordinary window (with the Dock icon) for the hub and its places: Today, Watching,
// Your words (with Review), Talk and Settings. On macOS it is drawn in the sidebar material under a
// dark tint, with the window buttons inset in the page, like the side panel.
import { BrowserWindow } from 'electron'
import { loadPage, webPreferences } from './load'

export function createHomeWindow(): BrowserWindow {
  const glass = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Duet',
    ...(glass
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000', titleBarStyle: 'hiddenInset' as const }
      : { backgroundColor: '#101013' }),
    show: false,
    webPreferences
  })
  loadPage(window, 'home')
  window.once('ready-to-show', () => window.show())
  return window
}
