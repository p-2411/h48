// The Explain window: a side window with the explanation of one line. (The plan is to join it with
// the tutor in one window later; the view is one component, src/renderer/src/explain/ExplainView.)
import type { BrowserWindow } from 'electron'
import { createSideWindow } from './side'

export function createExplainWindow(): BrowserWindow {
  return createSideWindow('explain', 'Explain', { width: 440, height: 680 })
}
