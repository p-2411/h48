// The supported sites. To add one, write its file (see types.ts), list it here, and give it a name in
// SITE_NAMES (shared/types.ts) and an entry in the caption reader's `sites` table.
import { crunchyroll } from './crunchyroll'
import { disneyplus } from './disneyplus'
import { netflix } from './netflix'
import type { Source } from './types'
import { youtube } from './youtube'

export * from './types'

export const SOURCES: Source[] = [youtube, netflix, disneyplus, crunchyroll]

export function sourceForSite(site: Source['site']): Source | undefined {
  return SOURCES.find((source) => source.site === site)
}

/** The site a page address belongs to, if Duet supports it. */
export function sourceFor(url: string | undefined): Source | undefined {
  return url ? SOURCES.find((source) => source.matches(url)) : undefined
}
