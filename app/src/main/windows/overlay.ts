// The overlay: a frameless, transparent window that floats above every other window, including
// fullscreen video, over the video where subtitles sit (placement.ts moves it there). It is shown without taking
// focus, so the video keeps its keyboard controls.
//
// Most of the window is empty: the strip sits at its bottom, with room above for its actions, a
// word's popup and the settings. Clicks pass through the empty part to the video; the page says
// when the pointer is over something of Duet's (duet:solid), and only then does the window take
// clicks.
import { BrowserWindow, screen } from 'electron'
import type { Settings } from '../settings'
import { loadPage, webPreferences } from './load'
import { onScreen } from './side'

/** The window's size, and the space below the strip inside it (the stage's bottom padding). */
export const OVERLAY = { width: 900, height: 560, padding: 6 }
const BOTTOM_GAP = 40

/**
 * Where the overlay rests with no video in view: where the learner last dragged it, if that is
 * still on a screen; else the bottom middle of the main screen. (On a video, see placement.ts.)
 */
export function restingPosition(settings: Settings): { x: number; y: number } {
  const saved = settings.current.overlayPosition
  if (saved && onScreen({ ...saved, width: OVERLAY.width, height: OVERLAY.height })) return saved
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - OVERLAY.width) / 2),
    y: Math.round(workArea.y + workArea.height - OVERLAY.height - BOTTOM_GAP)
  }
}

export function createOverlay(settings: Settings): BrowserWindow {
  const overlay = new BrowserWindow({
    width: OVERLAY.width,
    height: OVERLAY.height,
    ...restingPosition(settings),
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
