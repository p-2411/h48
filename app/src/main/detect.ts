// Which language a caption line is in, so captions in a language other than the one being learnt
// (English captions on a Spanish video, say) are left alone instead of being taken for it.
//
// Each language Duet teaches says how it is recognised (shared/languages): languages with their own
// script by the share of the line in it, languages in Latin letters by their commonest words and
// marks, weighed against other languages that share the alphabet. Lines too short to tell (a name,
// "OK", numbers) give undefined: the caller decides from the lines around them.
import { countMatches, latinRanking, scriptLanguage, type Language } from '../shared/languages'

/** The language of a line: one Duet teaches, 'other', or undefined when it can't be told. */
export function detectLanguage(line: string): Language | 'other' | undefined {
  // Sound tags such as [Música] or (risas) aren't speech.
  const text = line.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
  const letters = countMatches(text, /\p{L}/gu)
  if (!letters) return undefined
  const script = scriptLanguage(text)
  if (script) return script
  // Chinese characters with no kana: Chinese, or Japanese too short to tell.
  const han = countMatches(text, /\p{Script=Han}/gu)
  if (han / letters > 0.5) return han >= 6 ? 'other' : undefined
  if (countMatches(text, /\p{Script=Latin}/gu) / letters < 0.5) return 'other'

  const [best, second] = latinRanking(text)
  if (best.score === 0 || best.score === second?.score) return countMatches(text, /[\p{L}']+/gu) >= 6 ? 'other' : undefined
  return best.taught ? (best.code as Language) : 'other'
}
