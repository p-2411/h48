// The side panel window: beside the video, with tabs (Script, Explain). Opened from the
// strip or the menu bar; its tabs are in src/renderer/src/panel. Drawn in the macOS sidebar
// material, and opens where it was last left.
import type { BrowserWindow, Rectangle } from 'electron'
import { createSideWindow } from './side'

export function createPanelWindow(bounds?: Rectangle): BrowserWindow {
  return createSideWindow('panel', 'Duet', { width: 460, height: 720, bounds, glass: true })
}
