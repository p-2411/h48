// YouTube: watch pages and Shorts. The whole transcript is fetched (youtube-transcript.ts), and the
// reader can pause, play and seek the player.
import { fetchTranscript } from './youtube-transcript'
import type { Source } from './types'

function hostIsYouTube(url: URL): boolean {
  return url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')
}

export const youtube: Source = {
  site: 'youtube',
  name: 'YouTube',
  matches: (address) => {
    try {
      return hostIsYouTube(new URL(address))
    } catch {
      return false
    }
  },
  videoId: (address) => {
    try {
      const url = new URL(address)
      if (!hostIsYouTube(url)) return undefined
      if (url.pathname === '/watch') return url.searchParams.get('v') ?? undefined
      return url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1]
    } catch {
      return undefined
    }
  },
  fetchTranscript,
  controls: { playPause: true, seek: true },
  linkAt: (id, seconds) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.max(0, Math.floor(seconds))}s`
}
