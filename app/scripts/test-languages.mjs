// Checks caption language detection (main/detect.ts) and the tutor's per-turn check (speaks) for every
// language in shared/languages, and that each language's folder has everything a language needs
// (shared/languages/README.md). Run: npx jiti scripts/test-languages.mjs
import { existsSync, readFileSync } from 'node:fs'
import { detectLanguage } from '../src/main/detect.ts'
import { joinTokens } from '../src/shared/levels.ts'
import { LANGUAGE_CODES, languageModule, latinRanking, speaks } from '../src/shared/languages/index.ts'
import { clipKey, voiceLines } from '../src/renderer/src/welcome/lines.ts'

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

// Every language's folder is complete: what a new language still lacks is said here.
const recorded = new Set(JSON.parse(readFileSync('src/renderer/src/welcome/voice-clips.json', 'utf8')))
for (const code of LANGUAGE_CODES) {
  const language = languageModule(code)
  const list = `src/shared/languages/${code}/frequency.json`
  check(existsSync(list), `${code}: no ${list} (scripts/make-frequency-lists.py makes it)`)
  check(JSON.parse(readFileSync(list, 'utf8')).length >= 1000, `${code}: its frequency list has under 1,000 words`)
  check(existsSync(`resources/dictionaries/${code}.sqlite`), `${code}: no dictionary pack (npm run dictionaries -- <folder> ${code})`)
  check(language.voice.tag.startsWith(`${code}-`), `${code}: its voice tag (${language.voice.tag}) is for another language`)
  const { welcome } = language
  check(existsSync(`src/renderer/public/video/welcome/${welcome.video}.webm`), `${code}: no welcome video ${welcome.video}.webm`)
  check(welcome.bands.length === 4 && welcome.bands.every((band) => band.length >= 2), `${code}: the placement test needs two words in each of four bands`)
  for (const item of welcome.bands.flat())
    check(new Set([item.en, ...item.wrong]).size === 4, `${code}: ${item.word}'s choices repeat`)
  for (const line of voiceLines().filter((each) => each.lang === language.voice.tag))
    check(recorded.has(clipKey(line.lang, line.text)), `${code}: "${line.text}" has no recording (npm run voice:welcome)`)
}

console.log('Language detection test passed.')
