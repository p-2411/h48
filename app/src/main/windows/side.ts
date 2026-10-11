// A side window: an ordinary window at the right edge of the screen, beside the video, kept above
// other windows so it is not lost behind the browser. The tutor and Explain windows are side windows.
import { BrowserWindow, screen } from 'electron'
import { loadPage, webPreferences, type Page } from './load'

const EDGE_GAP = 24

export function createSideWindow(page: Page, title: string, { width, height }: { width: number; height: number }): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - EDGE_GAP,
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: 360,
    minHeight: 480,
    title,
    backgroundColor: '#101013',
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences
  })
  loadPage(window, page)
  window.once('ready-to-show', () => window.show())
  return window
}
