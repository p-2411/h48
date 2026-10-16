// Everything Duet says in the first run, in one place: the flow (flow.ts) says these, and the voice
// script (scripts/record-welcome-voice.mjs) records each once in Duet's voice, so the first run
// plays recorded clips instead of calling a speech API. A line that has no clip (a new line before
// it's recorded, or keys the learner changed) falls back to the system's voice.
import { LANGUAGE_CODES, languageModule, languageName, type Language } from '../../../shared/languages'
import { joinTokens } from '../../../shared/levels'
import { CONTENT, LEVEL_NAMES, PLACED, WELCOME } from './content'

export const LINES = {
  hi: 'Hi, I’m Duet.',
  talkOrText: 'Should I talk out loud, or keep it to text?',
  willTalk: 'Great, I’ll talk.',
  textItIs: 'Text it is.',
  whichLanguage: 'Which language are we learning?',
  findLevel: (language: Language) => `Let’s find your level. It sets how much of each line I put in ${languageName(language)}.`,
  pickMeaning: 'Pick what each word means. Not sure? Just say so.',
  another: 'Here’s another.',
  harderGood: 'Good. A harder one.',
  harderNice: 'Nice. A harder one.',
  easier: 'No problem. An easier one.',
  hard: 'That one’s hard. Good to know.',
  lastOne: 'Last one. What does this line mean?',
  rightAbout: (placed: number) => `You’re right about ${LEVEL_NAMES[placed]}.`,
  placed: (placed: number) => PLACED[placed],
  realClip: 'Now let’s try a real clip.',
  watchLine: 'Watch the line.',
  colour: 'Colour shows how well you know each word.',
  tooMuch: (language: Language) => `Too much ${languageName(language)}? The circle on the strip changes that.`,
  pointWord: 'Point at a coloured word.',
  meansHere: 'That’s what it means here.',
  tapSave: 'Tap Save to keep it as a flashcard.',
  likeThat: 'Like that. Saved words become flashcards.',
  findThem: 'You’ll find them in the Duet app.',
  sayWithMe: 'Now say it with me.',
  needMic: 'I’ll need your mic to hear you.',
  noMic: 'I can’t reach your mic. That’s fine for now.',
  noProblem: 'No problem.',
  didntCatch: 'I didn’t catch that. Try again?',
  sceneEnds: 'When a scene ends, the line glows.',
  pointGlow: 'Click it for a quick question.',
  ownWords: 'Answer in your own words.',
  countsToday: 'Nice! That counts for today.',
  thirdVideo: 'These start after your third video.',
  welcome: (placed: number) => WELCOME[placed],
  keys: 'Press {keys} to show or hide me.',
  /** The keys line as said when the learner's keys weren't recorded (they changed them): the keycaps show. */
  theseKeys: 'Press these keys to show or hide me.',
  oneOk: 'To show up on your videos, I need one OK from macOS.',
  askLater: 'No problem. I’ll ask when you open a video.',
  allSet: 'Done. You’re all set.',
  pressPlay: (language: Language) => `Press play on something you love. I’ll bring the ${languageName(language)}.`,
  skipped: 'No problem. Meet me properly from Settings, any time.'
}

/** The show/hide keys as said out loud, from an Electron accelerator ("Alt+Shift+D"). */
export function keyNames(shortcut: string, mac: boolean): string {
  return shortcut
    .split('+')
    .map((key) => {
      const k = key.toLowerCase()
      if (k === 'alt' || k === 'option') return mac ? 'Option' : 'Alt'
      if (k === 'commandorcontrol' || k === 'cmdorctrl') return mac ? 'Command' : 'Control'
      if (k === 'command' || k === 'cmd' || k === 'super' || k === 'meta') return mac ? 'Command' : 'Windows'
      if (k === 'control' || k === 'ctrl') return 'Control'
      return key
    })
    .join(' ')
}

/** How a line is voiced: as Duet chatting in English, Duet saying something in the language, or a word
 * said clearly to be recognised by ear. */
export type Delivery = 'duet' | 'native' | 'word'

/** A recorded clip's name: the voice's language and the words as said (FNV-1a), so a changed line
 * never plays an old recording. */
export function clipKey(lang: string, spoken: string): string {
  let hash = 0x811c9dc5
  for (const char of `${lang}|${spoken}`) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Every clip the first run can play, for the voice script. */
export function voiceLines(): { lang: string; text: string; delivery: Delivery }[] {
  const out: { lang: string; text: string; delivery: Delivery }[] = []
  const english = (text: string): void => void out.push({ lang: 'en-US', text, delivery: 'duet' })
  for (const value of Object.values(LINES)) if (typeof value === 'string' && value !== LINES.keys) english(value)
  // The lines that take a level or a language.
  for (let i = 0; i < LEVEL_NAMES.length; i++) [LINES.rightAbout(i), LINES.placed(i), LINES.welcome(i)].forEach(english)
  for (const language of LANGUAGE_CODES) [LINES.findLevel(language), LINES.tooMuch(language), LINES.pressPlay(language)].forEach(english)
  // The show/hide keys: the default, said as on a Mac and as on Windows.
  for (const mac of [true, false]) english(LINES.keys.replace('{keys}', keyNames('Alt+Shift+D', mac)))
  // In the language: Duet's hello and well done, the strip's line, and the test's words to hear.
  for (const language of LANGUAGE_CODES) {
    const c = CONTENT[language]
    const native = (text: string, delivery: Delivery = 'native'): void => void out.push({ lang: c.voice, text, delivery })
    native(c.hello)
    native(c.perfect)
    native(joinTokens(languageModule(language).sample.source))
    for (const item of c.bands.flat()) native(item.word, 'word')
    native(c.full, 'word')
  }
  return out
}
