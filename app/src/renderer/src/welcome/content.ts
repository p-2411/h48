// What the first run says and asks, per language: Duet's hello, the placement test's words by
// frequency band, and the whole line that checks anyone placed high. Each language's is in its
// folder (shared/languages/<code>/welcome.ts); the levels and Duet's lines about them are here.
import { LANGUAGE_CODES, languageModule, type Language, type Welcome, type WelcomeItem } from '../../../shared/languages'

// A test word: the word, how it's read (Japanese, Korean), its meaning and three wrong ones.
export type Item = WelcomeItem

/** A language's first-run content (its folder's welcome.ts), with its voice's language tag and the
 * high-placement check's English choices, which every language shares. */
export type Content = Welcome & {
  /** The speech voice's language tag. */
  voice: string
  check: { right: string; wrong: [string, string] }
}

const CHECK: Content['check'] = {
  right: 'Leave the keys on the table; I’ll be back tomorrow.',
  wrong: ['Take the keys off the table; I left yesterday.', 'The keys are on the table; come back tomorrow.']
}

export const CONTENT = Object.fromEntries(
  LANGUAGE_CODES.map((code) => {
    const language = languageModule(code)
    return [code, { ...language.welcome, voice: language.voice.tag, check: CHECK }]
  })
) as Record<Language, Content>

// The learner's level, set by the placement: its own words, so it never reads like a word's rung.
export const LEVEL_NAMES = ['Starter', 'Beginner', 'Elementary', 'Intermediate', 'Upper intermediate']
// What that level does to the line, as Duet says it.
export const PLACED = ['So I’ll start with one easy word a line.', 'So I’ll swap in a couple of words a line.', 'So about three words a line.', 'So most of each line.', 'So nearly the whole line.']
// Duet's welcome at the end: the level, said as a good place to be.
export const WELCOME = [
  'You’re a Starter, and that’s the fun part.',
  'You’re a Beginner with a head start. Lovely.',
  'Elementary already. What a nice start!',
  'Intermediate already. You’re going to fly.',
  'Upper intermediate! We’re going to have fun.'
]
