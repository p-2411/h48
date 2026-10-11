// The overlay: a frameless, transparent window that floats above every other window, including
// fullscreen video, near the bottom of the screen where subtitles sit. It is shown without taking
// focus, so the video keeps its keyboard controls.
//
// Most of the window is empty: the strip sits at its bottom, with room above for its actions, a
// word's popup and the settings. Clicks pass through the empty part to the video; the page says
// when the pointer is over something of Duet's (duet:solid), and only then does the window take
// clicks.
import { BrowserWindow, screen } from 'electron'
import { loadPage, webPreferences } from './load'

const WIDTH = 900
const HEIGHT = 560
const BOTTOM_GAP = 40

export function createOverlay(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const overlay = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - HEIGHT - BOTTOM_GAP),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences
  })
  // Above fullscreen apps and on every desktop/space.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.setIgnoreMouseEvents(true, { forward: true })

  loadPage(overlay, 'index')

  overlay.once('ready-to-show', () => overlay.showInactive())
  return overlay
}

export function toggleOverlay(overlay: BrowserWindow): void {
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}
