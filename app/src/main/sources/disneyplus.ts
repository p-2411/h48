// Disney+: heard, never read. Its subtitles aren't read (Disney+ and Crunchyroll are audio only),
// and Duet can't work its player, so the audio itself decides when something is being said. Player
// pages are /play/<id>, sometimes after a locale (/en-gb/play/<id>).
import { onSite, pathMatch } from './address'
import { SITE_NAMES } from '../../shared/types'
import type { Source } from './types'

const DOMAIN = 'disneyplus.com'

export const disneyplus: Source = {
  site: 'disneyplus',
  name: SITE_NAMES.disneyplus,
  matches: (address) => !!onSite(address, DOMAIN),
  videoId: (address) => pathMatch(onSite(address, DOMAIN), /^\/(?:play|video)\/([\w-]+)/)?.[1],
  listensFirst: true,
  // "Watch The Mandalorian | Disney+": the title without the site's words around it.
  videoTitle: (windowTitle) =>
    windowTitle
      .replace(/\s*[|–-]\s*Disney\+.*$/i, '')
      .replace(/^Watch\s+/i, '')
      .replace(/^Disney\+$/i, '')
      .trim() || undefined,
  controls: { playPause: false, seek: false },
  // Disney+ has no address for a point in a video: it opens where the learner left off.
  linkAt: (id) => `https://www.${DOMAIN}/play/${encodeURIComponent(id)}`
}
