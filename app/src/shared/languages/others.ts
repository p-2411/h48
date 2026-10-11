// Latin-script languages Duet doesn't teach, known only so that text in one isn't taken for one
// it does (Spanish shares its alphabet with all of them). A language that becomes taught gets its
// own module, and is then left out of this list automatically (see index.ts).
import type { Recognition } from './module'

type Words = Extract<Recognition, { kind: 'words' }>

export const OTHER_LATIN: Record<string, Words> = {
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

