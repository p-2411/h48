// A video's name from its browser window's title. Browsers add their own name to the page's title,
// and some the profile's after it ("Netflix - Google Chrome – Parham"); each site then drops its own
// words (sources/*.ts videoTitle).
import { SITE_NAMES, type Site } from '../../shared/types'
import { sourceForSite } from '.'

const BROWSER_TAIL =
  /\s+[-–—]\s+(?:Google Chrome|Chromium|Microsoft\u200b?\s?Edge|Brave|Arc|Opera|Vivaldi|(?:Mozilla )?Firefox|Safari)(?:\s+[-–—]\s+.*)?$/i

/** The page's title without the browser's name (and the profile after it). */
export function withoutBrowser(windowTitle: string): string {
  return windowTitle.replace(BROWSER_TAIL, '').trim()
}

/** A saved video's name to show: cleaned as a new one would be (titles saved before were not), or
 * undefined when the window only gave the site's name. */
export function shownTitle(site: Site, title: string | null | undefined): string | undefined {
  if (!title) return undefined
  const page = withoutBrowser(title)
  const source = sourceForSite(site)
  return source ? source.videoTitle(page) : page || undefined
}

/** Where a word was heard: the video's name, else the site's. */
export function heardOn(site: Site, title: string | null | undefined): string {
  return shownTitle(site, title) ?? SITE_NAMES[site]
}
