// The supported sites. To add one, write its file (see types.ts) and list it here.
import { netflix } from './netflix'
import type { Source } from './types'
import { youtube } from './youtube'

export * from './types'

export const SOURCES: Source[] = [youtube, netflix]

/** The site a page address belongs to, if Duet supports it. */
export function sourceFor(url: string | undefined): Source | undefined {
  return url ? SOURCES.find((source) => source.matches(url)) : undefined
}
