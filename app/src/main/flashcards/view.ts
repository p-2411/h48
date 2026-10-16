// How the flashcards page sees a card or a word: its step, the question it asks this time, its
// dictionary entry, where it was last heard and its tips. "Last heard" and "Heard N times" are read
// from the watch log and the ladder each time, never stored on the card, so a card made by hand
// fills itself in the first time its word comes up in a video.
//
// What Duet already knows comes first: the line model gave each word of a line its dictionary form,
// its English there and its job, and the card has its meaning. That alone makes a back; the
// dictionary (src/main/dictionary) adds the rest from what's kept, and asks the AI only for a card
// whose entry wasn't fetched ahead (the worst case).
import type { Card } from '../../shared/cards'
import {
  cardKey,
  chooseKind,
  fold,
  mmss,
  orderTips,
  splitLine,
  stepOf,
  type DictEntry,
  type FlashcardView,
  type LastHeard,
  type SplitLine,
  type Step,
  type Tip
} from '../../shared/flashcards'
import { keyWord, pairKeys, type WordState } from '../../shared/knowledge'
import { pairReading, pairText } from '../../shared/levels'
import type { Moment } from '../../shared/moment'
import type { Language, ProcessedLine, Site, WordJob } from '../../shared/types'
import type { Dictionary } from '../dictionary'
import { heardOn } from '../sources/title'
import { database } from '../store/db'

// Lines looked through for where a word was heard, most recent first.
const LINES_LOOKED_AT = 60
// "Also heard" lists this many other places.
const ALSO_HEARD = 2

/** What the line model said about the word in one line: its English there, its job, its reading. */
export type InLine = { english?: string; job?: WordJob; reading?: string }

/** One place a word was heard: the line and the video it was in, and what the line model said about
 * the word there. */
export type Encounter = LastHeard &
  InLine & { videoId: string; site: string; url: string; videoKey: string }

/** The word with this key in a processed line, if it's there. */
function inLine(
  language: Language,
  processed: ProcessedLine | undefined,
  key: string
): InLine | undefined {
  if (!processed?.source?.length) return undefined
  const word = pairKeys(language, processed).find((item) => item.key === key)
  if (!word) return undefined
  return {
    english: pairText(processed.english ?? [], word.pair).trim() || undefined,
    job: word.job,
    reading: pairReading(processed.source, word.pair)
  }
}

// A word's job in its line, as a part of speech (describing words and glue say too little).
const JOB_POS: Partial<Record<WordJob, string>> = { n: 'noun', v: 'verb', p: 'pronoun', x: 'name' }

/** An entry from what Duet already knows, with no request: the word, its part of speech from its job,
 * and its meaning (the card's, or its English in the line). */
export function knownEntry(
  word: string,
  meaning: string | undefined,
  place: InLine | undefined
): DictEntry | undefined {
  const sense = meaning?.trim() || place?.english
  if (!sense && !place?.job) return undefined
  return { word, pos: place?.job && JOB_POS[place.job], senses: sense ? [sense] : [], related: [] }
}

type LineRow = {
  original: string
  translation: string | null
  start: number | null
  processed: string | null
  video_id: string
  site: string
  url: string
  title: string | null
}

/** The word a card is for, as the dictionary has it. */
export function wordOf(card: Card): string {
  return keyWord(card.language, cardKey(card)) ?? card.expression
}

/** The form of the word last seen on screen, and how many times it was. */
export function seenWord(language: Language, key: string): { text?: string; seen: number } {
  const row = database()
    .prepare('SELECT text, seen FROM words WHERE language = ? AND key = ?')
    .get(language, key) as { text: string; seen: number } | undefined
  return { text: row?.text, seen: row?.seen ?? 0 }
}

/** Where the word was heard, most recent first, one per video: from the lines the watch log keeps
 * (the most recent videos only). A line counts when its words include the word's key, or, for a
 * line from before the line model gave words, when the word can be found in it. */
export function encounters(language: Language, key: string, forms: string[]): Encounter[] {
  const patterns = [...new Set(forms.map((form) => form.trim()).filter(Boolean))].slice(0, 2)
  if (!patterns.length) return []
  const rows = database()
    .prepare(
      `SELECT l.original, l.translation, l.start, l.processed, l.video_id, v.site, v.url, v.title
         FROM lines l JOIN videos v ON v.id = l.video_id
        WHERE l.language = ? AND (${patterns.map(() => "l.original LIKE ? ESCAPE '\\'").join(' OR ')})
        ORDER BY l.met_at DESC LIMIT ?`
    )
    .all(
      language,
      ...patterns.map((form) => `%${form.replace(/[\\%_]/g, (char) => `\\${char}`)}%`),
      LINES_LOOKED_AT
    ) as LineRow[]
  const found: Encounter[] = []
  for (const row of rows) {
    if (found.some((place) => place.videoKey === row.video_id)) continue
    let processed: ProcessedLine | undefined
    try {
      processed = row.processed ? (JSON.parse(row.processed) as ProcessedLine) : undefined
    } catch {
      processed = undefined
    }
    const said = inLine(language, processed, key)
    if (processed?.source?.length ? !said : !splitLine(row.original, forms).found) continue
    const id = row.video_id.startsWith(`${row.site}:`)
      ? row.video_id.slice(row.site.length + 1)
      : row.video_id
    found.push({
      line: row.original,
      translation: row.translation ?? processed?.translation ?? undefined,
      video: heardOn(row.site as Site, row.title),
      at: row.start ?? undefined,
      replayable: true,
      videoId: id,
      site: row.site,
      url: row.url,
      videoKey: row.video_id,
      ...said
    })
  }
  return found
}

/** The card's own moment, as a place it was heard (before the watch log had it, or after its lines
 * were cleared away). */
function ownMoment(card: Card): Encounter | undefined {
  if (card.source.kind !== 'video') return undefined
  const { line, video } = card.source.moment
  return {
    ...inLine(card.language, line.processed, cardKey(card)),
    line: line.original,
    translation: line.processed?.translation,
    video: heardOn(video.site, video.title),
    at: line.start ?? video.position,
    replayable: !!video.id,
    videoId: video.id ?? '',
    site: video.site,
    url: video.url ?? '',
    videoKey: `${video.site}:${video.id ?? video.url ?? ''}`
  }
}

/** A moment to play a place again in its video. */
export function momentOf(language: Language, place: Encounter): Moment {
  return {
    language,
    line: { id: 0, original: place.line, at: Date.now(), start: place.at, state: 'ready' },
    earlier: [],
    video: {
      site: place.site as Site,
      url: place.url,
      title: place.video,
      id: place.videoId || undefined,
      position: place.at
    },
    takenAt: Date.now()
  }
}

/** The back's tips: from the explanation the card came from, its note, the other places the word was
 * heard, the dictionary's other meanings and related words. */
export function tipsFor(
  card: Pick<Card, 'explanation' | 'note' | 'meaning'> | undefined,
  entry: DictEntry | undefined,
  others: Encounter[]
): Tip[] {
  const tips: Tip[] = []
  const explanation = card?.explanation
  if (explanation?.notice?.text) tips.push({ label: 'Tip', text: explanation.notice.text })
  if (explanation?.alternative?.expression)
    tips.push({
      label: 'Tip',
      text: `You could also say “${explanation.alternative.expression}”. ${explanation.alternative.changes}`.trim()
    })
  if (card?.note) tips.push({ label: 'Note', text: card.note })
  if (others.length)
    tips.push({
      label: 'Also heard',
      text: others
        .slice(0, ALSO_HEARD)
        .map((place) => [place.video, mmss(place.at)].filter(Boolean).join(', '))
        .join(' · ')
    })
  const meaning = fold(card?.meaning ?? '')
  const otherSenses = (entry?.senses ?? [])
    .filter((sense) => !meaning || !meaning.includes(fold(sense).split(';')[0].trim()))
    .slice(0, 3)
  if (otherSenses.length && meaning)
    tips.push({ label: 'Other meanings', text: otherSenses.join('; ') })
  if (entry?.related.length) tips.push({ label: 'Related', text: entry.related.join(' · ') })
  return orderTips(tips)
}

/** What the dictionary is told about a card's word, so its meanings fit how the learner met it:
 * the card's own line and meaning (no watch-log reading, so it's cheap for many cards). */
export function hintFor(card: Card): { word: string; line?: string; meaning?: string } {
  return {
    word: wordOf(card),
    line: card.source.kind === 'video' ? card.source.moment.line.original : card.example?.line,
    meaning: card.meaning
  }
}

/** What a card's or a word's back is made of, shared by both. `ask`: when the entry was never
 * fetched, ask the AI now (for a card on screen) rather than make do with what's known. */
export async function backFor(
  language: Language,
  key: string,
  word: string,
  card: Card | undefined,
  deps: { dictionary: Dictionary },
  ask = true
): Promise<{
  entry?: DictEntry
  line?: SplitLine & { translation?: string }
  lastHeard?: LastHeard
  heardTimes: number
  tips: Tip[]
  heard: Encounter[]
}> {
  const seen = seenWord(language, key)
  const forms = [seen.text ?? '', word, card?.expression ?? ''].filter(Boolean)
  const heard = encounters(language, key, forms)
  const own = card ? ownMoment(card) : undefined
  const places = heard.length ? heard : own ? [own] : []
  const last = places[0]
  const known = knownEntry(word, card?.meaning, last)
  const kept = deps.dictionary.cached(language, word)
  const fetched =
    kept === undefined && ask
      ? await deps.dictionary.entry(language, {
          word,
          line: last?.line ?? card?.example?.line,
          meaning: card?.meaning ?? last?.english
        })
      : (kept ?? undefined)
  // The dictionary's entry, with what's known filling any gap.
  const entry = fetched ? { ...fetched, pos: fetched.pos ?? known?.pos } : known
  const lineText = last?.line ?? card?.example?.line
  const line = lineText
    ? { ...splitLine(lineText, forms), translation: last?.translation }
    : undefined
  const lastHeard = last && {
    line: last.line,
    translation: last.translation,
    video: last.video,
    at: last.at,
    replayable: last.replayable
  }
  return {
    entry,
    line,
    lastHeard,
    heardTimes: seen.seen,
    tips: tipsFor(card, entry, places.slice(1)),
    heard: places
  }
}

/** A card as the page shows it this time. */
export async function cardView(
  card: Card,
  state: WordState | undefined,
  deps: { dictionary: Dictionary; voice: boolean; picture: (id: string) => string | undefined }
): Promise<FlashcardView> {
  const step: Step = stepOf(state)
  const key = cardKey(card)
  const word = wordOf(card)
  const back = await backFor(card.language, key, word, card, deps)
  const picture = deps.picture(card.id)
  const kind = chooseKind({
    step,
    line: !!back.line,
    gap: !!back.line?.found,
    voice: deps.voice,
    picture: !!picture,
    turn: card.reps
  })
  return {
    card,
    kind,
    step,
    word,
    entry: back.entry,
    meaning: card.meaning,
    line: back.line,
    lastHeard: back.lastHeard,
    heardTimes: back.heardTimes,
    tips: kind === 'use' ? [] : back.tips,
    picture: kind === 'picture' ? picture : undefined,
    situation:
      kind === 'use'
        ? card.situation?.trim() || `Say something true about your week, using ${word}.`
        : undefined,
    voice: deps.voice
  }
}
