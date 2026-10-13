// Crunchyroll: heard, never read. Its player draws subtitles as a picture, so there is no text to
// read anyway, and Duet can't work its player: the audio itself decides when something is being
// said. Episode pages are /watch/<id>/<slug>, sometimes after a locale (/de/watch/<id>/…).
import { onSite, pathMatch } from './address'
import { SITE_NAMES } from '../../shared/types'
import type { Source } from './types'

const DOMAIN = 'crunchyroll.com'

export const crunchyroll: Source = {
  site: 'crunchyroll',
  name: SITE_NAMES.crunchyroll,
  matches: (address) => !!onSite(address, DOMAIN),
  videoId: (address) => pathMatch(onSite(address, DOMAIN), /^\/watch\/([A-Z0-9]+)/i)?.[1],
  listensFirst: true,
  // "Watch One Piece - Romance Dawn - Crunchyroll": the title without the site's words around it.
  videoTitle: (windowTitle) =>
    windowTitle
      .replace(/\s*[|–-]\s*Crunchyroll.*$/i, '')
      .replace(/^Watch\s+/i, '')
      .replace(/^Crunchyroll$/i, '')
      .trim() || undefined,
  controls: { playPause: false, seek: false },
  // No address for a point in an episode is known: it opens where the learner left off.
  linkAt: (id) => `https://www.${DOMAIN}/watch/${encodeURIComponent(id)}`
}
