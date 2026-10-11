// Which language a caption line is in, so captions in a language other than the one being learnt
// (English captions on a Spanish video, say) are left alone instead of being taken for it.
//
// Japanese and Korean show in their scripts (kana, Hangul). Spanish shares its alphabet with English
// and others, so it is told by its marks (ñ ¿ ¡ and accents) and its commonest words against theirs.
// Lines too short to tell (a name, "OK", numbers) give undefined: the caller decides from the lines
// around them.
import type { Language } from '../shared/types'

const COMMON: Record<string, string[]> = {
  es: ['que', 'de', 'el', 'la', 'los', 'las', 'y', 'en', 'un', 'una', 'es', 'no', 'por', 'con', 'para', 'lo', 'se', 'me', 'te', 'mi', 'tu', 'qué', 'está', 'estoy', 'pero', 'como', 'muy', 'yo', 'eres', 'soy', 'del', 'al', 'más', 'sí', 'bien', 'aquí', 'ya', 'hay', 'tiene', 'tengo', 'ha', 'he', 'mucho', 'mucha', 'alguien', 'algo', 'nada', 'todo', 'este', 'esta', 'ese', 'esa', 'eso', 'su', 'sus', 'nos', 'le', 'les', 'cuando', 'donde', 'porque', 'también', 'ahora', 'vamos', 'puedo', 'quiero'],
  // "a" is left out: it is a Spanish word too.
  en: ['the', 'and', 'you', 'is', 'to', 'of', 'it', 'that', 'what', 'i', 'in', 'this', 'are', 'was', 'have', 'for', 'with', 'my', 'your', 'me', 'we', 'he', 'she', 'they', 'do', "don't", "i'm", "it's", "you're", 'be', 'not', 'just', 'so', 'here', 'there', 'can', 'will', 'all', 'yes'],
  pt: ['não', 'você', 'é', 'um', 'uma', 'com', 'para', 'isso', 'eu', 'ele', 'ela', 'mas', 'muito', 'está', 'são', 'tem', 'vai', 'aqui', 'meu', 'seu', 'obrigado', 'também', 'então', 'nós', 'do', 'da', 'no', 'na'],
  fr: ['le', 'les', 'et', 'est', 'je', 'tu', 'vous', 'nous', 'il', 'elle', 'pas', 'une', 'des', 'du', 'que', 'qui', 'mais', 'avec', 'pour', 'ce', "c'est", 'oui', 'non', 'très', 'ici', 'mon', 'ton'],
  it: ['il', 'che', 'non', 'di', 'è', 'un', 'una', 'per', 'sono', 'mi', 'ti', 'ma', 'con', 'questo', 'anche', 'sì', 'grazie', 'io', 'tu', 'lui', 'lei', 'molto', 'qui', 'perché'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'du', 'sie', 'wir', 'ein', 'eine', 'mit', 'zu', 'auf', 'ja', 'nein', 'was', 'aber', 'auch', 'hier', 'mein', 'dein']
}

/** The language of a line: one Duet teaches, 'other', or undefined when it can't be told. */
export function detectLanguage(line: string): Language | 'other' | undefined {
  // Sound tags such as [Música] or (risas) aren't speech.
  const text = line.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
  const letters = text.match(/\p{L}/gu) ?? []
  if (!letters.length) return undefined
  const count = (pattern: RegExp): number => (text.match(pattern) ?? []).length
  const hangul = count(/\p{Script=Hangul}/gu)
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu)
  const han = count(/\p{Script=Han}/gu)
  if (hangul / letters.length > 0.3) return 'ko'
  if (kana > 0 && (kana + han) / letters.length > 0.3) return 'ja'
  // Chinese characters with no kana: Chinese, or Japanese too short to tell.
  if (han / letters.length > 0.5) return han >= 6 ? 'other' : undefined
  const latin = count(/\p{Script=Latin}/gu)
  if (latin / letters.length < 0.5) return 'other'

  const words = text.toLocaleLowerCase().match(/[\p{L}']+/gu) ?? []
  const scores = Object.fromEntries(
    Object.entries(COMMON).map(([language, common]) => [language, words.filter((word) => common.includes(word)).length])
  )
  // Letters that mark a language: ñ ¿ ¡ only Spanish uses (of these); á í ó ú lean Spanish; ã õ ç
  // Portuguese; è ê à ù œ French; ì ò Italian; ä ö ü ß German.
  scores.es += count(/[ñ¿¡]/giu) * 2 + count(/[áíóú]/giu)
  scores.pt += count(/[ãõç]/giu) * 2
  scores.fr += count(/[èêàùœ]/giu) * 2
  scores.it += count(/[ìò]/giu) * 2
  scores.de += count(/[äöüß]/giu) * 2
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  if (best[1] === 0 || best[1] === second[1]) return words.length >= 6 ? 'other' : undefined
  return best[0] === 'es' ? 'es' : 'other'
}
