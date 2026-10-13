// Netflix: there is no transcript to fetch (its subtitles are part of its protected stream), and its
// captions are often off, in another language, or drawn as images (Japanese, Korean), so Duet hears
// it from the start; captions in the language being learnt take over when they are on. The reader
// finds Netflix's controls by their labels (its class names are scrambled), and they only exist
// while they show on screen: pausing, playing and seeking work when the controls are up; the clock
// runs on its own in between.
import { SITE_NAMES } from '../../shared/types'
import { onSite } from './address'
import type { Source } from './types'

const DOMAIN = 'netflix.com'

export const netflix: Source = {
  site: 'netflix',
  name: SITE_NAMES.netflix,
  matches: (address) => !!onSite(address, DOMAIN),
  videoId: (address) => onSite(address, DOMAIN)?.pathname.match(/^\/watch\/(\d+)/)?.[1],
  // Netflix's window title is just "Netflix".
  videoTitle: (windowTitle) => (/^netflix$/i.test(windowTitle.trim()) ? undefined : windowTitle.trim() || undefined),
  listensFirst: true,
  controls: { playPause: true, seek: true },
  linkAt: (id, seconds) => `https://www.netflix.com/watch/${encodeURIComponent(id)}?t=${Math.max(0, Math.floor(seconds))}`
}
