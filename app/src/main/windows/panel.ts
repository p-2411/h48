// The side panel window: beside the video, with tabs (Script, Explain). Opened from the overlay bar
// or the menu bar; its tabs are in src/renderer/src/panel.
import type { BrowserWindow } from 'electron'
import { createSideWindow } from './side'

export function createPanelWindow(): BrowserWindow {
  return createSideWindow('panel', 'Duet', { width: 460, height: 720 })
}
