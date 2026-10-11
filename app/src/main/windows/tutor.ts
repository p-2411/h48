// The tutor window: a side window for talking about a line and practising it. It has room for a
// conversation and recording controls, which the overlay over the video does not.
import type { BrowserWindow } from 'electron'
import { createSideWindow } from './side'

export function createTutorWindow(): BrowserWindow {
  return createSideWindow('tutor', 'Duet tutor', { width: 440, height: 680 })
}
