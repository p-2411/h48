// Which language a caption line is in, so captions in a language other than the one being learnt
// (English captions on a Spanish video, say) are left alone instead of being taken for it.
//
// Each language Duet teaches says how it is recognised (shared/languages): languages with their own
// script by the share of the line in it, languages in Latin letters by their commonest words and
// marks, weighed against those of other languages that share the alphabet (below). Lines too short
// to tell (a name, "OK", numbers) give undefined: the caller decides from the lines around them.
import { countMatches, LANGUAGE_CODES, languageModule, wordScore, type Language, type Recognition } from '../shared/languages'

type Words = Extract<Recognition, { kind: 'words' }>

// Latin-script languages Duet doesn't teach, only so a line in one isn't taken for one it does.
const OTHERS: Record<string, Words> = {
  // "a" is left out: it is a Spanish word too.
  en: {
    kind: 'words',
    words: ['the', 'and', 'you', 'is', 'to', 'of', 'it', 'that', 'what', 'i', 'in', 'this', 'are', 'was', 'have', 'for', 'with', 'my', 'your', 'me', 'we', 'he', 'she', 'they', 'do', "don't", "i'm", "it's", "you're", 'be', 'not', 'just', 'so', 'here', 'there', 'can', 'will', 'all', 'yes'],
    marks: []
  },
  pt: {
    kind: 'words',
    words: ['não', 'você', 'é', 'um', 'uma', 'com', 'para', 'isso', 'eu', 'ele', 'ela', 'mas', 'muito', 'está', 'são', 'tem', 'vai', 'aqui', 'meu', 'seu', 'obrigado', 'também', 'então', 'nós', 'do', 'da', 'no', 'na'],
    marks: [{ pattern: /[ãõç]/giu, weight: 2 }]
  },
  fr: {
    kind: 'words',
    words: ['le', 'les', 'et', 'est', 'je', 'tu', 'vous', 'nous', 'il', 'elle', 'pas', 'une', 'des', 'du', 'que', 'qui', 'mais', 'avec', 'pour', 'ce', "c'est", 'oui', 'non', 'très', 'ici', 'mon', 'ton'],
    marks: [{ pattern: /[èêàùœ]/giu, weight: 2 }]
  },
  it: {
    kind: 'words',
    words: ['il', 'che', 'non', 'di', 'è', 'un', 'una', 'per', 'sono', 'mi', 'ti', 'ma', 'con', 'questo', 'anche', 'sì', 'grazie', 'io', 'tu', 'lui', 'lei', 'molto', 'qui', 'perché'],
    marks: [{ pattern: /[ìò]/giu, weight: 2 }]
  },
  de: {
    kind: 'words',
    words: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'du', 'sie', 'wir', 'ein', 'eine', 'mit', 'zu', 'auf', 'ja', 'nein', 'was', 'aber', 'auch', 'hier', 'mein', 'dein'],
    marks: [{ pattern: /[äöüß]/giu, weight: 2 }]
  }
}

/** The language of a line: one Duet teaches, 'other', or undefined when it can't be told. */
export function detectLanguage(line: string): Language | 'other' | undefined {
  // Sound tags such as [Música] or (risas) aren't speech.
  const text = line.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
  const letters = countMatches(text, /\p{L}/gu)
  if (!letters) return undefined

  for (const code of LANGUAGE_CODES) {
    const recognition = languageModule(code).recognise
    if (recognition.kind !== 'script') continue
    const own = countMatches(text, recognition.letters)
    const shared = own && recognition.alsoCounts ? countMatches(text, recognition.alsoCounts) : 0
    if ((own + shared) / letters > recognition.share) return code
  }
  // Chinese characters with no kana: Chinese, or Japanese too short to tell.
  const han = countMatches(text, /\p{Script=Han}/gu)
  if (han / letters > 0.5) return han >= 6 ? 'other' : undefined
  if (countMatches(text, /\p{Script=Latin}/gu) / letters < 0.5) return 'other'

  const taught = LANGUAGE_CODES.flatMap((code): [string, Words][] => {
    const recognition = languageModule(code).recognise
    return recognition.kind === 'words' ? [[code, recognition]] : []
  })
  const ranked = [...taught, ...Object.entries(OTHERS)]
    .map(([code, words]) => [code, wordScore(words, text)] as const)
    .sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  if (best[1] === 0 || best[1] === second[1]) return countMatches(text, /[\p{L}']+/gu) >= 6 ? 'other' : undefined
  return taught.some(([code]) => code === best[0]) ? (best[0] as Language) : 'other'
}
