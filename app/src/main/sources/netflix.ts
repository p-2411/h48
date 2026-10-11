// Netflix: lines come from the captions on screen (Netflix's subtitles are part of its protected
// stream, so there is no transcript to fetch). The reader does not drive Netflix's player yet:
// adding that means finding its buttons and time in the reader's `sites` table, then turning the
// controls on here.
import type { Source } from './types'

export const netflix: Source = {
  site: 'netflix',
  name: 'Netflix',
  matches: (address) => {
    try {
      const host = new URL(address).hostname
      return host === 'netflix.com' || host.endsWith('.netflix.com')
    } catch {
      return false
    }
  },
  videoId: (address) => {
    try {
      return new URL(address).pathname.match(/^\/watch\/(\d+)/)?.[1]
    } catch {
      return undefined
    }
  },
  // Netflix's window title is just "Netflix".
  videoTitle: (windowTitle) => (/^netflix$/i.test(windowTitle.trim()) ? undefined : windowTitle.trim() || undefined),
  controls: { playPause: false, seek: false },
  linkAt: (id, seconds) => `https://www.netflix.com/watch/${encodeURIComponent(id)}?t=${Math.max(0, Math.floor(seconds))}`
}
