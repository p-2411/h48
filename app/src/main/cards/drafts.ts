// Cards made straight from a line, without Explain: one click on the strip. A word card comes from
// a pair of matching phrases in the line (the word and its English partner); a line card from the
// whole line and its translation.
import { pairKeys } from '../../shared/knowledge'
import { joinTokens } from '../../shared/levels'
import type { CardDraft } from '../../shared/cards'
import type { Moment } from '../../shared/moment'

/** A card for a whole line, or for one of its words when `pair` names its pair of phrases. */
export function draftFromMoment(moment: Moment, pair?: number): CardDraft | undefined {
  const processed = moment.line.processed
  if (!processed) return undefined
  const base = { type: 'understand' as const, language: moment.language, source: { kind: 'video' as const, moment } }
  if (pair === undefined)
    return { ...base, expression: moment.line.original, meaning: processed.translation, target: 'what the whole line means here' }
  const source = joinTokens(processed.source.filter((token) => token.pair === pair))
  const english = joinTokens(processed.english.filter((token) => token.pair === pair))
  if (!source || !english) return undefined
  // The word it is for: its dictionary form ("ir" for a card on "fue").
  const word = pairKeys(moment.language, processed).find((item) => item.pair === pair)
  return { ...base, expression: source, meaning: english, target: `${source} = ${english}`, ...(word && { wordKey: word.key }) }
}
