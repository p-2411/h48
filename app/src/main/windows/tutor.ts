// The tutor window: an ordinary window beside the video, for talking about a line and practising
// it. It has room for a conversation and recording controls, which the overlay over the video
// does not. It stays above other windows so it is not lost behind the browser.
import { BrowserWindow, screen } from 'electron'
import { loadPage, webPreferences } from './load'

const WIDTH = 440
const HEIGHT = 680
const EDGE_GAP = 24

export function createTutorWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const tutor = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: workArea.x + workArea.width - WIDTH - EDGE_GAP,
    y: workArea.y + Math.round((workArea.height - HEIGHT) / 2),
    minWidth: 360,
    minHeight: 480,
    title: 'Duet tutor',
    backgroundColor: '#101013',
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences
  })
  loadPage(tutor, 'tutor')
  tutor.once('ready-to-show', () => tutor.show())
  return tutor
}
