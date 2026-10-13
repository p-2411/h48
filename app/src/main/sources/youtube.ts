// YouTube: watch pages and Shorts. The whole transcript is fetched (youtube-transcript.ts), and the
// reader can pause, play and seek the player.
import { SITE_NAMES } from '../../shared/types'
import { onSite } from './address'
import { fetchTranscript } from './youtube-transcript'
import type { Source } from './types'

const DOMAIN = 'youtube.com'

export const youtube: Source = {
  site: 'youtube',
  name: SITE_NAMES.youtube,
  matches: (address) => !!onSite(address, DOMAIN),
  videoId: (address) => {
    const url = onSite(address, DOMAIN)
    if (url?.pathname === '/watch') return url.searchParams.get('v') ?? undefined
    return url?.pathname.match(/^\/shorts\/([\w-]+)/)?.[1]
  },
  fetchTranscript,
  // "(3) Sintel - YouTube": drop the notification count and the site's name.
  videoTitle: (windowTitle) => windowTitle.replace(/^\(\d+\)\s*/, '').replace(/\s*[-–]\s*YouTube.*$/, '').trim() || undefined,
  controls: { playPause: true, seek: true },
  linkAt: (id, seconds) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.max(0, Math.floor(seconds))}s`
}
