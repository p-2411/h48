// The first-run window: what Duet does, the language and level, and (on macOS) the two permissions, before
// the first video.
import { BrowserWindow } from 'electron'
import { loadPage, webPreferences } from './load'

export function createWelcomeWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 620,
    height: 640,
    resizable: false,
    title: 'Welcome to Duet',
    backgroundColor: '#101013',
    show: false,
    webPreferences
  })
  loadPage(window, 'welcome')
  window.once('ready-to-show', () => window.show())
  return window
}
