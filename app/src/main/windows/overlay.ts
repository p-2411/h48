// The overlay: a frameless, transparent window that floats above every other window, including
// fullscreen video, over the video where subtitles sit (placement.ts moves it there). It is shown without taking
// focus, so the video keeps its keyboard controls.
//
// Most of the window is empty: the strip sits at its bottom, with room above for its actions, a
// word's popup and the settings. Clicks pass through the empty part to the video; the page says
// when the pointer is over something of Duet's (duet:solid), and only then does the window take
// clicks.
import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { Settings } from '../settings'
import { loadPage, webPreferences } from './load'
import { OVERLAY, overlayBounds, stripOnScreen } from './overlay-size'

export { OVERLAY } from './overlay-size'
// With no place saved, the strip's bottom sits this far above the bottom of the screen's work area.
const STRIP_ABOVE_BOTTOM = 46

/**
 * Where the overlay rests with no video in view: where the learner last dragged it, if its strip is
 * still on a screen; else the bottom middle of the main screen. (On a video, see placement.ts.)
 */
export function restingBounds(settings: Settings): Rectangle {
  const saved = settings.current.overlayPosition
  if (saved && stripOnScreen(saved, screen.getAllDisplays().map((display) => display.workArea))) {
    const { workArea } = screen.getDisplayNearestPoint({ x: Math.round(saved.x + OVERLAY.width / 2), y: Math.round(saved.y + OVERLAY.height) })
    return overlayBounds(saved.x, saved.y, workArea.y)
  }
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: Math.round(workArea.x + (workArea.width - OVERLAY.width) / 2),
    y: Math.round(workArea.y + workArea.height - STRIP_ABOVE_BOTTOM + OVERLAY.padding - OVERLAY.height),
    width: OVERLAY.width,
    height: OVERLAY.height
  }
}

export function createOverlay(settings: Settings): BrowserWindow {
  const overlay = new BrowserWindow({
    ...restingBounds(settings),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    // On macOS, a panel: Duet has a Dock icon (it is a normal app), and a normal app's window can't
    // join another app's full-screen space; a panel floats over it, on every desktop.
    ...(process.platform === 'darwin' && { type: 'panel' }),
    show: false,
    // Its animations (Motion, on requestAnimationFrame) must run on time: macOS can take this
    // see-through window for covered, and the throttling would stall them half-way.
    webPreferences: { ...webPreferences, backgroundThrottling: false }
  })
  // Above fullscreen apps and on every desktop/space. Electron would otherwise make the whole app a
  // background one for this (no Dock icon, no app menu); as a panel the strip doesn't need it.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  overlay.setIgnoreMouseEvents(true, { forward: true })

  loadPage(overlay, 'index')

  overlay.once('ready-to-show', () => overlay.showInactive())
  return overlay
}

export function toggleOverlay(overlay: BrowserWindow): void {
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}
