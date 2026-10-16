// The flashcards page (docs/design/cards): what its three views show, and the small decisions behind
// them, kept pure so they can be tested (scripts/test-flashcards.mjs). The page lives in the Your
// words place of the home base; the main process side is src/main/flashcards.
//
// Words climb four steps, each in its word colour: Heard, Known, You can say it, You can use it
// (shared/knowledge.ts works out which). A card asks one question that depends on its word's step and
// on what Duet has for it, and ends with Forgot or Got it; Duet works out how hard it was.
import type { Card, Rating } from './cards'
import { wordKey, type WordState } from './knowledge'
import { languageModule } from './languages'
import type { Language } from './types'

/** The four steps, lowest first, as the page names them in code. */
export const STEPS = ['heard', 'known', 'say', 'use'] as const
export type Step = (typeof STEPS)[number]

/** Each step as the learner reads it (the same words as STATE_LABELS). */
export const STEP_LABELS: Record<Step, string> = {
  heard: 'Heard',
  known: 'Known',
  say: 'You can say it',
  use: 'You can use it'
}

/** A word's rung as a step. A word with a card has been met, so New to you reads as Heard; an
 * ignored word keeps its card where it was, at Heard. */
export function stepOf(state: WordState | undefined): Step {
  if (state === 'known') return 'known'
  if (state === 'speakable') return 'say'
  if (state === 'usable') return 'use'
  return 'heard'
}

/** The rung each step is, for the knowledge ladder's colours (data-k in words.css). */
export const STEP_STATE: Record<Step, WordState> = {
  heard: 'encountered',
  known: 'known',
  say: 'speakable',
  use: 'usable'
}

/** The kinds of card. Heard has four (sentence, word, listening, picture); each step above has one. */
export type CardKind = 'sentence' | 'word' | 'listening' | 'picture' | 'gap' | 'use' | 'fresh'

export const KIND_NAMES: Record<CardKind, string> = {
  sentence: 'Sentence card',
  word: 'Word card',
  listening: 'Listening card',
  picture: 'Picture card',
  gap: 'Gap card',
  use: 'Use-it card',
  fresh: 'Keep-fresh card'
}

/** The one line shown the first time each kind of card comes up. */
export const KIND_NOTES: Record<CardKind, string> = {
  sentence: 'A word from your video, in its line. What does it mean here?',
  word: 'Just the word and its sound. What does it mean?',
  listening: 'Hear the line with its words hidden. Double-click play to hear it slower.',
  picture: 'A picture of the word. What’s it called?',
  gap: 'The line is missing a word. Say it out loud, or type it.',
  use: 'A small situation. Use the word in a sentence of your own.',
  fresh: 'A word you already use. A quick check that it’s still there.'
}

/** What decides a card's kind: its step, and what Duet has for it. `turn` is how many times the card
 * has been reviewed, so the twists (listening, a picture) come now and then, not every time. */
export type KindInputs = {
  step: Step
  line: boolean
  gap: boolean
  voice: boolean
  picture: boolean
  turn: number
}

/** The card's kind this time. Heard: a sentence card when there is a line, a word card when not; every
 * third time a listening card (with a line and a voice to read it) or, with a picture, a picture card.
 * Known: a gap card when the word can be found in its line, else a word card. Then use-it, then
 * keep-fresh. */
export function chooseKind({ step, line, gap, voice, picture, turn }: KindInputs): CardKind {
  if (step === 'use') return 'fresh'
  if (step === 'say') return 'use'
  if (step === 'known') return line && gap ? 'gap' : 'word'
  const twist = turn % 3 === 2
  if (twist && picture) return 'picture'
  if (twist && line && voice) return 'listening'
  if (picture && !line) return 'picture'
  return line ? 'sentence' : 'word'
}

/** How the learner did, as the page saw it. `revealMs`: from the card showing to the answer showing;
 * `replays`: plays of the line or word before answering; `spoken`: how a spoken or typed answer went. */
export type AnswerSignals = {
  got: boolean
  revealMs: number
  replays: number
  spoken?: 'good' | 'poor'
}

// Slower than this to show the answer reads as hard; quicker (with no replays) as easy.
const HARD_MS = 12_000
const EASY_MS = 3_500

/** The scheduler's rating from Forgot or Got it and how it went: Forgot is Again; Got it is Good, or
 * Hard when it took long, needed replays or was said poorly, or Easy when it came at once on a card
 * already learnt. The learner only ever sees the two buttons. */
export function inferRating(
  { got, revealMs, replays, spoken }: AnswerSignals,
  card: Pick<Card, 'state'>
): Rating {
  if (!got) return 'again'
  if (spoken === 'poor' || replays >= 2 || revealMs > HARD_MS) return 'hard'
  // A spoken answer takes longer to give, so it has twice the time to count as easy.
  const quick = revealMs < (spoken ? EASY_MS * 2 : EASY_MS)
  if (card.state === 'review' && replays === 0 && quick) return 'easy'
  return 'good'
}

/** "in a minute", "in 10 minutes", "later today", "tomorrow", "in 4 days", "in 2 months": when a card
 * comes back, after it was answered (never on the buttons). */
export function comesBack(due: number, now: number): string {
  const minutes = (due - now) / 60_000
  if (minutes < 2) return 'in a minute'
  if (minutes < 60) return `in ${Math.round(minutes)} minutes`
  const days = minutes / 1440
  if (days < 0.75) return 'later today'
  if (days < 1.5) return 'tomorrow'
  if (days < 30) return `in ${Math.round(days)} days`
  const months = Math.round(days / 30)
  if (days < 365) return months === 1 ? 'in a month' : `in ${months} months`
  const years = Math.round((days / 365) * 10) / 10
  return years === 1 ? 'in a year' : `in ${years} years`
}

/** A line split around the word it's about, so the page can bold it or leave a gap. `found` is false
 * when the word couldn't be found (then `before` is the whole line). */
export type SplitLine = { before: string; word: string; after: string; found: boolean }

/** A word as matching sees it: composed and lower case. */
export const fold = (text: string): string => text.normalize('NFC').toLocaleLowerCase()

/** The key of the word a card is for. */
export const cardKey = (card: Card): string => card.wordKey ?? wordKey(card.language, card.expression)

/** Seconds as m:ss ("" for none). */
export function mmss(seconds?: number): string {
  if (seconds === undefined) return ''
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Finds the word in the line: the form seen on screen first, then the dictionary form, then the
 * longest shared start (a verb's stem: "madrug" in "madrugué"), whole words only where words are
 * separated by spaces. */
export function splitLine(line: string, forms: string[]): SplitLine {
  const text = fold(line)
  const tries = forms.map((form) => fold(form.trim())).filter(Boolean)
  const spaced = /\s/.test(line.trim())
  const at = (index: number, length: number): SplitLine => ({
    before: line.slice(0, index),
    word: line.slice(index, index + length),
    after: line.slice(index + length),
    found: true
  })
  const isEdge = (index: number): boolean =>
    index < 0 || index >= text.length || !/[\p{L}\p{M}\p{N}]/u.test(text[index])
  for (const form of tries) {
    let index = text.indexOf(form)
    while (index >= 0) {
      if (!spaced || (isEdge(index - 1) && isEdge(index + form.length)))
        return at(index, form.length)
      index = text.indexOf(form, index + 1)
    }
  }
  // A changed form: a word in the line sharing a long enough start with the dictionary form.
  if (spaced)
    for (const form of tries) {
      const stem = form.slice(0, Math.max(3, form.length - 3))
      const match = new RegExp(
        `(^|[^\\p{L}\\p{M}])(${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}\\p{M}]*)`,
        'u'
      ).exec(text)
      if (match && stem.length >= 3) return at(match.index + match[1].length, match[2].length)
    }
  return { before: line, word: '', after: '', found: false }
}

/** Whether a typed answer to a gap card is the word: the same letters, ignoring case, accents left as
 * typed only when the learner typed them (so "senor" doesn't pass for "señor", but "Sartén" does). */
export function sameWord(typed: string, expected: string[]): boolean {
  const answer = fold(typed.trim().replace(/[.,!?¡¿;:"“”'’]+/g, ''))
  return !!answer && expected.some((form) => fold(form.trim()) === answer)
}

/** A dictionary entry (src/main/dictionary): the parts of a card's back that come from a dictionary
 * rather than the card. Any part may be missing. Made from what Duet already knows about the word,
 * filled in by the app's AI once and kept. */
export type DictEntry = {
  word: string
  /** "ma·dru·gar" */
  syllables?: string
  /** "/ma.ðɾuˈɣaɾ/" */
  ipa?: string
  /** Japanese: the word in kana ("たべる"). */
  reading?: string
  /** Japanese: the mora the pitch falls after (2 in たべꜜる); 0 when it never falls. */
  pitch?: number
  /** "verb", "noun" */
  pos?: string
  /** For nouns: "feminine", "masculine". */
  gender?: string
  /** The article that goes with a noun: "la", "el". */
  article?: string
  /** Its senses, most common first. */
  senses: string[]
  /** Words related to it ("madrugada, the small hours"). */
  related: string[]
  /** An everyday example of it, with its English: a hand-made card's line when the learner leaves
   * theirs empty. */
  example?: { line: string; translation: string }
}

// Small kana that share a mora with the kana before them (しゃ is one mora, not two).
const SMALL_KANA = /^[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ]$/

/** A Japanese reading split into morae, each marked high or low in Tokyo pitch accent: with the
 * pitch falling after mora `pitch` (たべꜜる: 2), or never (0). The first mora is low unless the
 * fall comes right after it. `drop` marks the mora the pitch falls after. */
export function pitchMorae(
  reading: string,
  pitch: number
): { text: string; high: boolean; drop: boolean }[] {
  const morae: string[] = []
  for (const ch of reading) {
    if (SMALL_KANA.test(ch) && morae.length) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae.map((text, index) => {
    const at = index + 1
    const high = pitch === 1 ? at === 1 : at > 1 && (pitch === 0 || at <= pitch)
    return { text, high, drop: at === pitch }
  })
}

/** The article a noun takes, where its language has them (shared/languages, article): none when
 * either fits. */
export function articleFor(language: Language, gender: string | undefined): string | undefined {
  if (!gender || gender.includes(' or ')) return undefined
  return languageModule(language).article?.(gender)
}

/** Where the learner last heard the word, read from the watch log each time (never stored on the
 * card): the line, the video and the time in it, and how many times it was on screen. */
export type LastHeard = {
  line: string
  /** The line's English, when Duet translated it. */
  translation?: string
  video: string
  /** Seconds into the video, when known. */
  at?: number
  /** Whether Duet can play the moment again (the video is known). */
  replayable: boolean
}

/** One fold-out tip on the back: a label and its text. Careful first, then Listen for and Tip, then
 * the rest. */
export type Tip = {
  label: 'Careful' | 'Listen for' | 'Tip' | 'Also heard' | 'Other meanings' | 'Related' | 'Note'
  text: string
}

const TIP_ORDER: Tip['label'][] = [
  'Careful',
  'Listen for',
  'Tip',
  'Note',
  'Also heard',
  'Other meanings',
  'Related'
]

/** The tips for a back, in their order, without repeats or empty ones. */
export function orderTips(tips: Tip[]): Tip[] {
  const seen = new Set<string>()
  return tips
    .filter((tip) => {
      const text = tip.text.trim()
      const key = `${tip.label}|${fold(text)}`
      if (!text || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => TIP_ORDER.indexOf(a.label) - TIP_ORDER.indexOf(b.label))
}

/** A card as the page shows it: the card, the question it asks this time, its word's step, and what
 * its back is made of. */
export type FlashcardView = {
  card: Card
  kind: CardKind
  step: Step
  /** The word the card is for (its dictionary form). */
  word: string
  /** The dictionary entry, when the word was found. */
  entry?: DictEntry
  /** The meaning that fits the line: the card's own. */
  meaning: string
  /** The line the card shows: where it was last heard, or the card's own line, or none. */
  line?: SplitLine & { translation?: string }
  /** Where it was last heard; none when it hasn't been heard in a video yet. */
  lastHeard?: LastHeard
  /** How many times it was on screen. */
  heardTimes: number
  tips: Tip[]
  /** A picture, as a data URL, for a picture card. */
  picture?: string
  /** For a use-it card: the situation to use the word in. */
  situation?: string
  /** Whether Duet's voice can read the word and the line (an API key for it). */
  voice: boolean
}

/** What a session reviews: today's cards (all collections mixed; Today's session caps them with
 * `limit`), one collection's, one video's, or
 * one word's cards off schedule (Practise now: nothing is rescheduled). */
export type SessionScope =
  | { kind: 'today'; limit?: number }
  | { kind: 'collection'; id: string }
  | { kind: 'video'; video: string }
  | { kind: 'practise'; key: string }

/** A session's state after each step. `total` counts the cards this session started with. */
export type SessionState = {
  scope: SessionScope
  next?: FlashcardView
  done: number
  total: number
  canUndo: boolean
  /** After an answer: the word, and when it comes back (and the step it climbed to, if it did). */
  answered?: { word: string; comesBack?: string; climbed?: Step }
  /** At the end: how many words climbed a step in this session. */
  climbed: number
}

/** A spoken or typed answer, checked: what was heard, Duet's one-line note, and whether it was right. */
export type SpokenCheck = { heard: string; note: string; good: boolean }

/** Today, on Review: the cards waiting, in plain words (new, learning, to review are FSRS states). */
export type TodayView = {
  counts: { new: number; learning: number; review: number }
  total: number
  /** The words up today, in their steps, the first few. */
  upToday: { word: string; step: Step }[]
  /** Words on each step, for the ladder. */
  ladder: Record<Step, number>
}

/** A word in Words: its entry and where it stands. */
export type WordView = {
  key: string
  word: string
  step: Step
  entry?: DictEntry
  meaning?: string
  line?: SplitLine
  lastHeard?: LastHeard
  heardTimes: number
  tips: Tip[]
  /** Its cards, newest first. */
  cards: Card[]
  /** When it's next reviewed (the soonest of its cards), if it has a card. */
  nextReview?: number
  /** Recall sooner is on for its cards. */
  sooner: boolean
  /** Its card's picture: decided (a picture, or none) or not yet, and whether it can come from a video. */
  picture?: { cardId: string; state: 'set' | 'none' | 'unset'; url?: string; fromVideo: boolean }
  paused: boolean
  ignored: boolean
}

/** A video's words, for By video. */
export type VideoGroup = {
  id: string
  title: string
  site: string
  /** When it was last watched, ms since 1970. */
  watched: number
  words: { word: string; step: Step }[]
  /** How many cards it has, and how many are due. */
  cards: number
  due: number
  /** A line from it, for its still. */
  line?: string
}

/** A collection: a pile of cards on Collections. Only From your videos exists until decks can be
 * brought in. */
export type CollectionView = {
  id: string
  name: string
  meta?: string
  cards: number
  due: number
  top?: { word: string; meaning: string; step: Step }
}

/** Where a picture card's picture comes from. */
export type PictureSource = 'capture' | 'upload' | 'generate' | 'none'

/** The page's own remembered choices: the first-run guide seen, the kinds of card already met. */
export type FlashcardsPrefs = { guideSeen: boolean; kindsSeen: CardKind[] }

export type { Language }
