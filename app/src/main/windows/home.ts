// The home base: an ordinary window (with the Dock icon) for the hub and its places: Today, Watching,
// Your words (with Review), Talk and Settings. Its page paints Duet's grain surface (styles/ui.css)
// over the whole window, with the window buttons inset in the page, like the side panel.
import { BrowserWindow, shell } from 'electron'
import { loadPage, webPreferences } from './load'

export function createHomeWindow(dark = false): BrowserWindow {
  const glass = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    title: 'Duet',
    backgroundColor: dark ? '#121313' : '#f2f3f3',
    ...(glass
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // The window buttons' middle on the top bar's (52px tall, home.css), level with Duet.
          trafficLightPosition: { x: 18, y: 16 }
        }
      : process.platform === 'win32'
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: {
              height: 48,
              color: dark ? '#121313' : '#f2f3f3',
              symbolColor: dark ? '#eef3f1' : '#1b201f'
            }
          }
        : {}),
    show: false,
    webPreferences
  })
  // A link on a page (Settings → Sources) opens in the browser, never in a Duet window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadPage(window, 'home')
  window.once('ready-to-show', () => window.show())
  return window
}
