// Checks caption language detection (main/detect.ts) and the tutor's per-turn check (speaks) for every
// language in shared/languages. Run: npx jiti scripts/test-languages.mjs
import { detectLanguage } from '../src/main/detect.ts'
import { joinTokens } from '../src/shared/levels.ts'
import { LANGUAGE_CODES, languageModule, latinRanking, speaks } from '../src/shared/languages/index.ts'

const check = (ok, what) => {
  if (!ok) throw new Error(what)
}

// What each line was detected as before languages became modules; it must not change.
const DETECTED = {
  '¿Qué te trae a la tierra de los guardianes?': 'es', 'Es un pueblo pequeño.': 'es', 'What brings you here?': 'other',
  'I am going home now, ok?': 'other', 'こんにちは、元気ですか': 'ja', 東京: undefined, '你好，我们今天去哪里吃饭呢朋友': 'other',
  안녕하세요: 'ko', OK: undefined, '[Música]': undefined, 'Bonjour, je suis très content de vous voir': 'other',
  'Não sei, você está aqui?': 'other', 'Ich bin nicht hier': 'other', 'Grazie mille, sono molto felice': 'other',
  Gracias: undefined, mucho: 'es', 'El agua está fría': 'es', 'Sí, sí, claro que sí': 'es', 'Hola!': undefined, 123: undefined,
  Mañana: 'es', 'Vamos a la playa con mis amigos esta tarde': 'es', 'the house is big and the car is red': 'other',
  // Mostly Korean with a few kanji: the script with the larger share wins, whatever the registry order.
  '사랑해요 정말 ありが': 'ko'
}
for (const [line, expected] of Object.entries(DETECTED))
  check(detectLanguage(line) === expected, `detectLanguage(${JSON.stringify(line)}) gave ${detectLanguage(line)}, expected ${expected}`)

// Every language's own sample is detected as it, and counts as spoken in it.
for (const code of LANGUAGE_CODES) {
  const sample = joinTokens(languageModule(code).sample.source)
  check(detectLanguage(sample) === code || detectLanguage(sample) === undefined, `${code}: its sample was detected as another language`)
  check(speaks(code, sample), `${code}: its own sample does not count as spoken in it`)
}

// English turns, including corrections that quote a word, don't count as the language.
const ENGLISH = ['No, he told me to go home.', 'Hello, how are you doing today?', 'Close! Try saying ありがとう with a longer "o".', 'Almost: 감사합니다 has a tense sound in the middle.']
for (const code of LANGUAGE_CODES)
  for (const turn of ENGLISH) check(!speaks(code, turn), `${code}: an English turn counted as spoken in it: ${turn}`)

// A taught language is never also weighed as an untaught one (it would tie with itself).
const codes = latinRanking('hola').map((item) => item.code)
check(new Set(codes).size === codes.length, 'a language is ranked twice')

console.log('Language detection test passed.')
