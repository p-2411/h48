// A side window: at the right edge of the screen, kept above other windows so it is not lost behind
// the browser; a floating one goes over the video (full screen included), as the strip does. The
// side panel is one.
// One can open where it was last left (when that is still on a screen); its page paints Duet's grain
// surface over the window (styles/ui.css).
import { BrowserWindow, screen, type Rectangle } from 'electron'
import { loadPage, webPreferences, type Page } from './load'

const EDGE_GAP = 24

type Options = {
  width: number
  height: number
  bounds?: Rectangle
  glass?: boolean
  /** Over the video, as the strip is: above full-screen apps, on every desktop. */
  floating?: boolean
}

/** Whether the middle of a rectangle is on one of the screens. */
export function onScreen({ x, y, width, height }: Rectangle): boolean {
  const middle = { x: x + width / 2, y: y + height / 2 }
  return screen.getAllDisplays().some(({ workArea: area }) => middle.x >= area.x && middle.x <= area.x + area.width && middle.y >= area.y && middle.y <= area.y + area.height)
}

export function createSideWindow(page: Page, title: string, { width, height, bounds, glass, floating }: Options): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const place =
    bounds && onScreen(bounds)
      ? bounds
      : { width, height, x: workArea.x + workArea.width - width - EDGE_GAP, y: workArea.y + Math.round((workArea.height - height) / 2) }
  const window = new BrowserWindow({
    ...place,
    minWidth: 360,
    minHeight: 480,
    title,
    // Windows has no sidebar material, and a hidden title bar there would lose the window's buttons.
    ...(glass && process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000', titleBarStyle: 'hiddenInset' as const }
      : { backgroundColor: '#101013' }),
    alwaysOnTop: true,
    fullscreenable: false,
    // On macOS a normal app's window can't join another app's full-screen space; a panel floats over
    // it (as the strip does). On Windows a tool window, kept out of Alt+Tab.
    ...(floating && process.platform === 'darwin' && { type: 'panel' }),
    ...(floating && process.platform === 'win32' && { type: 'toolbar', skipTaskbar: true }),
    show: false,
    webPreferences
  })
  if (floating) {
    window.setAlwaysOnTop(true, 'screen-saver')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  }
  loadPage(window, page)
  window.once('ready-to-show', () => window.show())
  return window
}
