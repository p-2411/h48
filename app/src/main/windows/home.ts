// The home base: an ordinary window (with the Dock icon) for Today, Watching, My cards, Review and
// Settings.
import { BrowserWindow } from 'electron'
import { loadPage, webPreferences } from './load'

export function createHomeWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Duet',
    backgroundColor: '#000000',
    show: false,
    webPreferences
  })
  loadPage(window, 'home')
  window.once('ready-to-show', () => window.show())
  return window
}
