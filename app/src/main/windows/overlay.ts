// The overlay: a frameless, transparent window that floats above every other window, including
// fullscreen video, near the bottom of the screen where subtitles sit. It is shown without taking
// focus, so the video keeps its keyboard controls.
import { BrowserWindow, screen } from 'electron'
import { loadPage, webPreferences } from './load'

const WIDTH = 820
const HEIGHT = 300
const BOTTOM_GAP = 96

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
    resizable: true,
    minWidth: 520,
    minHeight: 180,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences
  })
  // Above fullscreen apps and on every desktop/space.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  loadPage(overlay, 'index')

  overlay.once('ready-to-show', () => overlay.showInactive())
  return overlay
}

export function toggleOverlay(overlay: BrowserWindow): void {
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}
