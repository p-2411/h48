// What a page may change with duet:set: a few on/off and either/or settings, each checked for its
// kind, so a page can't set anything else (the keys, the language, the onboarding). Pure, for tests.
import type { OverlaySettings } from '../../shared/types'

type PageSettings = Pick<OverlaySettings, 'pauseForHelp' | 'showEnglish' | 'wordScript'>

export function settingsChange(change: unknown): Partial<PageSettings> {
  const asked = change && typeof change === 'object' ? (change as Record<string, unknown>) : {}
  const kept: Partial<PageSettings> = {}
  if (typeof asked.pauseForHelp === 'boolean') kept.pauseForHelp = asked.pauseForHelp
  if (typeof asked.showEnglish === 'boolean') kept.showEnglish = asked.showEnglish
  if (asked.wordScript === 'native' || asked.wordScript === 'reading') kept.wordScript = asked.wordScript
  return kept
}
