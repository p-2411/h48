// My cards: an ordinary window with room to browse, edit and review saved cards.
import { BrowserWindow } from 'electron'
import { loadPage, webPreferences } from './load'

export function createCardsWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'Duet · My cards',
    backgroundColor: '#000000',
    show: false,
    webPreferences
  })
  loadPage(window, 'cards')
  window.once('ready-to-show', () => window.show())
  return window
}
