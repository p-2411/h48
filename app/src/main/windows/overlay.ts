// The overlay: a frameless, transparent window that floats above every other window, including
// fullscreen video, near the bottom of the screen where subtitles sit. It is shown without taking
// focus, so the video keeps its keyboard controls.
import { BrowserWindow, screen } from 'electron'
import { database } from '../store/db'
import { loadPage, webPreferences } from './load'

const WIDTH = 820
const HEIGHT = 300
const BOTTOM_GAP = 96
const BOUNDS_KEY = 'overlay-bounds'

type OverlayBounds = { x: number; y: number; width: number; height: number }

function savedBounds(): OverlayBounds | undefined {
  const row = database().prepare('SELECT value FROM settings WHERE key = ?').get(BOUNDS_KEY) as
    { value: string } | undefined
  try {
    const value = row ? (JSON.parse(row.value) as Partial<OverlayBounds>) : undefined
    if (
      !value ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height)
    )
      return undefined
    const bounds = value as OverlayBounds
    const visible = screen.getAllDisplays().some(({ workArea }) => {
      const overlapX =
        Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
        Math.max(bounds.x, workArea.x)
      const overlapY =
        Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
        Math.max(bounds.y, workArea.y)
      return overlapX >= 80 && overlapY >= 48
    })
    return visible ? bounds : undefined
  } catch {
    return undefined
  }
}

function rememberBounds(overlay: BrowserWindow): void {
  if (overlay.isDestroyed() || overlay.isMinimized() || overlay.isFullScreen()) return
  database()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
    )
    .run(BOUNDS_KEY, JSON.stringify(overlay.getBounds()))
}

export function createOverlay(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay()
  const previous = savedBounds()
  const overlay = new BrowserWindow({
    width: previous?.width ?? WIDTH,
    height: previous?.height ?? HEIGHT,
    x: previous?.x ?? Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: previous?.y ?? Math.round(workArea.y + workArea.height - HEIGHT - BOTTOM_GAP),
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

  let saveTimer: NodeJS.Timeout | undefined
  const scheduleSave = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => rememberBounds(overlay), 180)
  }
  overlay.on('move', scheduleSave)
  overlay.on('resize', scheduleSave)
  overlay.on('closed', () => clearTimeout(saveTimer))

  overlay.once('ready-to-show', () => overlay.showInactive())
  return overlay
}

export function toggleOverlay(overlay: BrowserWindow): void {
  if (overlay.isVisible()) overlay.hide()
  else overlay.showInactive()
}
