// The first-run window: Duet introduces itself, finds the learner's language and level, lets them
// try the strip on a clip, and on macOS asks for the one permission it needs. Its title bar is the
// page's own (with the window buttons inset), as in the home window.
import { BrowserWindow, nativeTheme } from 'electron'
import { loadPage, webPreferences } from './load'

/** With `replay`, the page plays it as a demo and saves no choices. */
export function createWelcomeWindow(replay = false): BrowserWindow {
  const dark = nativeTheme.shouldUseDarkColors
  const ground = dark ? '#121313' : '#f2f3f3'
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 920,
    minHeight: 600,
    title: 'Welcome to Duet',
    backgroundColor: ground,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // The window buttons' middle on the page's title bar (40px tall, welcome.css).
          trafficLightPosition: { x: 16, y: 14 }
        }
      : process.platform === 'win32'
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: { height: 40, color: ground, symbolColor: dark ? '#eef3f1' : '#1b201f' }
          }
        : {}),
    show: false,
    webPreferences
  })
  loadPage(window, 'welcome', replay ? { replay: '1' } : undefined)
  window.once('ready-to-show', () => window.show())
  return window
}
