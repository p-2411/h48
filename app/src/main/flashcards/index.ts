// The flashcards page, main-process side (docs/design/cards/flashcards-page.md): Review (today, the
// session, the finish), Words (a word's entry and where it stands) and Collections (the piles, and
// By video). Cards and their scheduling stay in src/main/cards; the ladder in src/main/knowledge;
// dictionary entries in src/main/dictionary. Only the home window may ask.
//
// IPC (all "flashcards:*"; window.duet.flashcards in src/preload/flashcards.ts):
//   prefs, set-prefs                          the guide seen, the kinds of card met
//   today                                     Review's counts, the words up today, the ladder
//   start, answer, undo, state                a session (today, a video's, Practise now)
//   speak                                     Duet reading a card's word or line
//   check-spoken, check-typed, check-use      a gap card's or use-it card's answer
//   replay                                    a card's word where it was last heard, in its video
//   word, sooner, pause                       a word in Words
//   collections, videos                       Collections
//   lookup, make                              Make a card
//   picture                                   a picture card's picture
import type { BrowserWindow, WebContents } from 'electron'
import type { Card } from '../../shared/cards'
import {
  cardKey,
  fold,
  sameWord,
  stepOf,
  type AnswerSignals,
  type CardKind,
  type CollectionView,
  type FlashcardsPrefs,
  type PictureSource,
  type SessionScope,
  type SpokenCheck,
  type Step,
  type TodayView,
  type VideoGroup,
  type WordView
} from '../../shared/flashcards'
import { keyWord, wordKey } from '../../shared/knowledge'
import { isLanguage } from '../../shared/languages'
import type { Moment } from '../../shared/moment'
import type { Language } from '../../shared/types'
import type { PronunciationCoach, SpeechToText, TextToSpeech } from '../ai/voice'
import type { Cards } from '../cards'
import { revive, serialize } from '../cards/scheduler'
import type { Quiz } from '../challenges/quiz'
import { Dictionary } from '../dictionary'
import { ownedHandler } from '../ipc/owned'
import type { Knowledge } from '../knowledge'
import { database, readSetting, writeSetting } from '../store/db'
import { captureStill, generatePicture, uploadPicture } from './pictures'
import { FlashcardSession, videoCardIds } from './session'
import { backFor, cardView, encounters, hintFor, momentOf, seenWord, wordOf } from './view'

const PREFS_KEY = 'flashcards'
const KINDS: CardKind[] = ['sentence', 'word', 'listening', 'picture', 'gap', 'use', 'fresh']
const LIVE = 'deleted_at IS NULL AND paused = 0'
// Cards whose entries are fetched ahead when Review opens or a session starts.
const PREFETCH = 40
// Make a card waits this long for a word's entry (the learner is waiting for it to fill in).
const LOOKUP_WAIT_MS = 15_000
// Up today lists this many words.
const UP_TODAY = 8
// By video lists this many videos, the most recently watched first.
const VIDEOS = 12
// A recording or an answer longer than this is refused.
const MAX_RECORDING_BYTES = 10 * 1024 * 1024
const MAX_TEXT = 400
const NO_VOICE = 'Speaking needs an OpenAI API key (OPENAI_API_KEY).'

export type FlashcardsDeps = {
  cards: Cards
  knowledge: Knowledge
  /** The home window: the only one that may ask, and the one file dialogs open over. */
  owns: (sender: WebContents) => boolean
  window: () => BrowserWindow | null
  replay: (moment: Moment) => void
  /** The video open in the browser now, if any. */
  currentVideo: () => { site: string; id: string; title?: string } | undefined
  voice?: { tts?: TextToSpeech; coach?: PronunciationCoach; stt?: SpeechToText }
  quiz?: Quiz
  /** Card backs' dictionary, on the app's AI; without one, backs show what Duet already knows. */
  dictionary?: Dictionary
}

const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${what} is missing.`)
  return value.trim().slice(0, MAX_TEXT)
}
const language = (value: unknown): Language => {
  if (!isLanguage(value)) throw new Error('That language isn’t one Duet teaches.')
  return value
}
const recording = (clip: unknown): { data: Uint8Array; mimeType: string } => {
  const data = (clip as { data?: unknown } | undefined)?.data
  if (!(data instanceof Uint8Array) || !data.length || data.length > MAX_RECORDING_BYTES)
    throw new Error('That recording could not be used. Try recording again.')
  return { data, mimeType: 'audio/wav' }
}
export class Flashcards {
  readonly dictionary: Dictionary
  private session: FlashcardSession
  private speech = new Map<string, { data: Uint8Array; mimeType: string }>()

  constructor(private readonly deps: FlashcardsDeps) {
    this.dictionary = deps.dictionary ?? new Dictionary()
    // A card saved anywhere (Explain, the strip, the tutor, Make a card) gets its entry now, in the
    // background, so it's ready long before the card is reviewed.
    deps.cards.on('saved', (card: Card) => this.dictionary.prefetch(card.language, [hintFor(card)]))
    this.session = new FlashcardSession({
      store: deps.cards.collection,
      newReview: () => deps.cards.newSession(),
      view: (card) => this.view(card),
      stepOf: (card) => this.stepOf(card),
      changed: () => deps.cards.notifyChanged(),
      collectionIds: (id) =>
        this.collectionCards(id)
          .filter((card) => !card.paused)
          .map((card) => card.id)
    })
    const handle = ownedHandler('flashcards', deps.owns, 'Only Duet’s main window can do that.')
    handle('prefs', () => this.prefs())
    handle('set-prefs', (change) => this.setPrefs(change as Partial<FlashcardsPrefs>))
    handle('today', (lang) => this.today(language(lang)))
    handle('start', (scope) => {
      const chosen = this.scopeOf(scope)
      this.prefetch(
        chosen.kind === 'practise' ? this.cardsWithKey(chosen.key) : this.waitingCards()
      )
      return this.session.start(chosen)
    })
    handle('answer', (cardId, signals) =>
      this.session.answer(text(cardId, 'The card'), this.signals(signals))
    )
    handle('undo', () => this.session.undo())
    handle('state', () => this.session.state())
    handle('speak', (cardId, what) =>
      this.speak(text(cardId, 'The card'), what === 'line' ? 'line' : 'word')
    )
    handle('check-spoken', (cardId, clip) =>
      this.checkSpoken(text(cardId, 'The card'), recording(clip))
    )
    handle('check-typed', (cardId, answer) =>
      this.checkTyped(text(cardId, 'The card'), text(answer, 'Your answer'))
    )
    handle('check-use', (cardId, answer) => this.checkUse(text(cardId, 'The card'), answer))
    handle('replay', (lang, key) => this.replay(language(lang), text(key, 'The word')))
    handle('word', (lang, key) => this.word(language(lang), text(key, 'The word')))
    handle('sooner', (lang, key, on) =>
      this.setSooner(language(lang), text(key, 'The word'), on === true)
    )
    handle('pause', (lang, key, paused) =>
      this.setPaused(language(lang), text(key, 'The word'), paused === true)
    )
    handle('collections', () => this.collections())
    handle('videos', (lang) => this.videos(language(lang)))
    handle('lookup', (lang, word) => this.lookup(language(lang), text(word, 'The word')))
    handle('make', (draft) => this.make(draft))
    handle('picture', (cardId, from) =>
      this.setPicture(text(cardId, 'The card'), from as PictureSource)
    )
  }

  // —— The page's own choices ——

  prefs(): FlashcardsPrefs {
    const kept = readSetting<Partial<FlashcardsPrefs>>(PREFS_KEY)
    return {
      guideSeen: kept?.guideSeen === true,
      kindsSeen: Array.isArray(kept?.kindsSeen)
        ? kept.kindsSeen.filter((kind) => KINDS.includes(kind))
        : []
    }
  }

  setPrefs(change: Partial<FlashcardsPrefs>): FlashcardsPrefs {
    const now = this.prefs()
    const next: FlashcardsPrefs = {
      guideSeen: typeof change?.guideSeen === 'boolean' ? change.guideSeen : now.guideSeen,
      kindsSeen: Array.isArray(change?.kindsSeen)
        ? [...new Set(change.kindsSeen.filter((kind) => KINDS.includes(kind)))]
        : now.kindsSeen
    }
    writeSetting(PREFS_KEY, next)
    return next
  }

  // —— Review ——

  today(lang: Language, now = Date.now()): TodayView {
    const db = database()
    const count = (sql: string, ...values: number[]): number =>
      (db.prepare(sql).get(...values) as { n: number }).n
    const learning = count(
      `SELECT COUNT(*) n FROM cards WHERE ${LIVE} AND state IN (1, 3) AND due <= ?`,
      now
    )
    const review = count(
      `SELECT COUNT(*) n FROM cards WHERE ${LIVE} AND state = 2 AND due <= ?`,
      now
    )
    const { newAvailable } = this.deps.cards.newSession().queue(now).counts
    const rows = [
      ...(db
        .prepare(
          `SELECT * FROM cards WHERE ${LIVE} AND state != 0 AND due <= ? ORDER BY due LIMIT ?`
        )
        .all(now, UP_TODAY) as { id: string }[]),
      ...(db
        .prepare(`SELECT * FROM cards WHERE ${LIVE} AND state = 0 ORDER BY created_at LIMIT ?`)
        .all(Math.min(newAvailable, UP_TODAY)) as { id: string }[])
    ]
    const upToday: TodayView['upToday'] = []
    for (const row of rows) {
      const card = this.deps.cards.collection.get(row.id)
      if (!card) continue
      const word = wordOf(card)
      if (!upToday.some((item) => item.word === word))
        upToday.push({ word, step: this.stepOf(card) })
      if (upToday.length >= UP_TODAY) break
    }
    // Review is open: the cards waiting get their entries before Start is pressed.
    this.prefetch(this.waitingCards(now))
    const { counts } = this.deps.knowledge.summary(lang, now)
    return {
      counts: { new: newAvailable, learning, review },
      total: newAvailable + learning + review,
      upToday,
      ladder: {
        heard: counts.encountered,
        known: counts.known,
        say: counts.speakable,
        use: counts.usable
      }
    }
  }

  /** The cards a review would show soonest: due ones, then new ones, at most PREFETCH. */
  private waitingCards(now = Date.now()): Card[] {
    const ids = database()
      .prepare(
        `SELECT id FROM cards WHERE ${LIVE} AND (state = 0 OR due <= ?) ORDER BY state = 0, due, created_at LIMIT ?`
      )
      .all(now, PREFETCH) as { id: string }[]
    return ids.map((row) => this.deps.cards.collection.get(row.id)).filter((card) => !!card)
  }

  /** Fetches the entries these cards' words don't have yet, a few words per request. */
  private prefetch(cards: Card[]): void {
    const byLanguage = new Map<Language, ReturnType<typeof hintFor>[]>()
    for (const card of cards)
      byLanguage.set(card.language, [...(byLanguage.get(card.language) ?? []), hintFor(card)])
    for (const [lang, hints] of byLanguage) this.dictionary.prefetch(lang, hints)
  }

  private scopeOf(value: unknown): SessionScope {
    const scope = value as Partial<{ kind: string; video: unknown; key: unknown }> | undefined
    if (scope?.kind === 'video') return { kind: 'video', video: text(scope.video, 'The video') }
    if (scope?.kind === 'collection')
      return { kind: 'collection', id: text((scope as { id?: unknown }).id, 'The collection') }
    if (scope?.kind === 'practise') return { kind: 'practise', key: text(scope.key, 'The word') }
    const limit = (scope as { limit?: unknown } | undefined)?.limit
    return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? { kind: 'today', limit } : { kind: 'today' }
  }

  private signals(value: unknown): AnswerSignals {
    const signals = value as Partial<AnswerSignals> | undefined
    const number = (n: unknown): number =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
    return {
      got: signals?.got === true,
      revealMs: number(signals?.revealMs),
      replays: Math.round(number(signals?.replays)),
      spoken: signals?.spoken === 'good' || signals?.spoken === 'poor' ? signals.spoken : undefined
    }
  }

  private stepOf(card: Card): Step {
    const key = cardKey(card)
    return stepOf(this.deps.knowledge.statesFor(card.language, [key])[key])
  }

  private pictureOf(id: string): string | undefined {
    const row = database().prepare('SELECT picture FROM cards WHERE id = ?').get(id) as
      { picture: string | null } | undefined
    return row?.picture && row.picture !== 'none' ? row.picture : undefined
  }

  private view(card: Card): ReturnType<typeof cardView> {
    const key = cardKey(card)
    const state = this.deps.knowledge.statesFor(card.language, [key])[key]
    return cardView(card, state, {
      dictionary: this.dictionary,
      voice: !!this.deps.voice?.tts,
      picture: (id) => this.pictureOf(id)
    })
  }

  private card(cardId: string): Card {
    const card = this.deps.cards.collection.get(cardId)
    if (!card) throw new Error('That card no longer exists.')
    return card
  }

  // —— Speaking and checking ——

  /** Duet reading a card's word, or the line it shows. */
  async speak(
    cardId: string,
    what: 'word' | 'line'
  ): Promise<{ data: Uint8Array; mimeType: string }> {
    const tts = this.deps.voice?.tts
    if (!tts) throw new Error(NO_VOICE)
    const card = this.card(cardId)
    const word = wordOf(card)
    let said = word
    if (what === 'line') {
      const back = await backFor(
        card.language,
        cardKey(card),
        word,
        card,
        { dictionary: this.dictionary },
        false
      )
      said = back.lastHeard?.line ?? card.example?.line ?? word
    }
    const id = `${card.language}|${said}`
    let clip = this.speech.get(id)
    if (!clip) {
      const spoken = await tts.speak(said, card.language)
      clip = { data: spoken.data, mimeType: spoken.mimeType }
      // A few clips are kept, so play and replay don't ask again.
      if (this.speech.size > 20) this.speech.delete(this.speech.keys().next().value!)
      this.speech.set(id, clip)
    }
    return clip
  }

  /** The forms a gap card's answer may take: the form in the line, the word, the form seen. */
  private async forms(card: Card): Promise<string[]> {
    const word = wordOf(card)
    const back = await backFor(
      card.language,
      cardKey(card),
      word,
      card,
      { dictionary: this.dictionary },
      false
    )
    return [
      back.line?.found ? back.line.word : '',
      word,
      seenWord(card.language, cardKey(card)).text ?? '',
      card.expression
    ].filter(Boolean)
  }

  /** A gap card said out loud: whether it was the word, and how it sounded. Saying it well counts
   * toward You can say it; getting the word counts as recalling it. */
  async checkSpoken(
    cardId: string,
    clip: { data: Uint8Array; mimeType: string }
  ): Promise<SpokenCheck> {
    const coach = this.deps.voice?.coach
    if (!coach) throw new Error(NO_VOICE)
    const card = this.card(cardId)
    const word = wordOf(card)
    const forms = await this.forms(card)
    const attempt = await coach.coach(clip, {
      original: forms[0] || word,
      translation: card.meaning,
      language: card.language
    })
    const heard = attempt.heard.trim()
    const right =
      sameWord(heard, forms) || forms.some((form) => form && fold(heard).includes(fold(form)))
    const good = right && attempt.good
    const key = cardKey(card)
    if (heard) {
      this.deps.knowledge.noteAttempt(card.language, key, 'recall', right)
      if (right) this.deps.knowledge.noteAttempt(card.language, key, 'say', attempt.good)
    }
    const note = !heard
      ? 'Duet didn’t catch that. Try again, a little closer to the mic.'
      : right
        ? attempt.note
        : `Duet heard “${heard}”. The word is ${forms[0] || word}.`
    return { heard, note, good }
  }

  /** A gap card typed: typing counts as recalling the word, not saying it. */
  async checkTyped(cardId: string, answer: string): Promise<SpokenCheck> {
    const card = this.card(cardId)
    const forms = await this.forms(card)
    const good = sameWord(answer, forms)
    this.deps.knowledge.noteAttempt(card.language, cardKey(card), 'recall', good)
    return { heard: answer, note: good ? 'That’s it.' : `It’s ${forms[0] || wordOf(card)}.`, good }
  }

  /** A use-it card: the learner's own sentence, typed or said. Used well, it counts toward You can
   * use it (each different sentence once); said, it also counts as saying the word. */
  async checkUse(cardId: string, answer: unknown): Promise<SpokenCheck> {
    const card = this.card(cardId)
    const word = wordOf(card)
    let sentence: string
    let spoken = false
    if (typeof answer === 'string') sentence = text(answer, 'Your sentence')
    else {
      const stt = this.deps.voice?.stt
      if (!stt) throw new Error(NO_VOICE)
      sentence = (await stt.transcribe(recording(answer), card.language)).text.trim()
      spoken = true
      if (!sentence)
        return {
          heard: '',
          note: 'Duet didn’t catch that. Try again, a little closer to the mic.',
          good: false
        }
    }
    const quiz = this.deps.quiz
    if (!quiz) throw new Error('Checking a sentence needs an OpenAI API key (OPENAI_API_KEY).')
    const situation = card.situation?.trim() || `Say something true about your week, using ${word}.`
    const verdict = await quiz.use(
      {
        id: 0,
        original: situation,
        translation: situation,
        processed: { translation: situation, source: [], english: [] }
      },
      sentence,
      [word],
      card.language
    )
    const good = verdict.words.some((item) => item.used && item.correct)
    const used = verdict.words.some((item) => item.used)
    const key = cardKey(card)
    if (used) this.deps.knowledge.noteAttempt(card.language, key, 'use', good, sentence)
    if (spoken && used) this.deps.knowledge.noteAttempt(card.language, key, 'say', good)
    return {
      heard: sentence,
      note: verdict.note || (good ? 'Nicely used.' : `Try it again with ${word}.`),
      good
    }
  }

  /** Plays the word where it was last heard, in its video. */
  replay(lang: Language, key: string): boolean {
    const word = keyWord(lang, key) ?? key
    const place =
      encounters(lang, key, [seenWord(lang, key).text ?? '', word])[0] ?? this.ownPlace(lang, key)
    if (!place || !place.videoId) return false
    this.deps.replay(momentOf(lang, place))
    return true
  }

  private ownPlace(lang: Language, key: string): ReturnType<typeof encounters>[number] | undefined {
    const card = this.cardsOf(lang, key).find((item) => item.source.kind === 'video')
    if (!card || card.source.kind !== 'video') return undefined
    const { line, video } = card.source.moment
    return {
      line: line.original,
      video: video.title ?? 'a video',
      at: line.start ?? video.position,
      replayable: !!video.id,
      videoId: video.id ?? '',
      site: video.site,
      url: video.url ?? '',
      videoKey: `${video.site}:${video.id ?? ''}`
    }
  }

  // —— Words ——

  /** A word's cards, by its key (which names its language). */
  private cardsWithKey(key: string): Card[] {
    return this.deps.cards.collection.list({ show: 'all' }).filter((card) => cardKey(card) === key)
  }

  private cardsOf(lang: Language, key: string): Card[] {
    return this.deps.cards.collection
      .list({ show: 'all' })
      .filter((card) => card.language === lang && cardKey(card) === key)
  }

  async word(lang: Language, key: string): Promise<WordView> {
    const cards = this.cardsOf(lang, key)
    const word = keyWord(lang, key) ?? cards[0]?.expression ?? key
    // A word with a card gets its full entry; one without uses what Duet knows, with no request.
    const back = await backFor(
      lang,
      key,
      word,
      cards[0],
      { dictionary: this.dictionary },
      cards.length > 0
    )
    const state = this.deps.knowledge.statesFor(lang, [key])[key]
    const live = cards.filter((card) => !card.paused)
    return {
      key,
      word,
      step: stepOf(state),
      entry: back.entry,
      meaning: cards[0]?.meaning ?? back.entry?.senses[0],
      line: back.line,
      lastHeard: back.lastHeard,
      heardTimes: back.heardTimes,
      tips: back.tips,
      cards,
      nextReview: live.length ? Math.min(...live.map((card) => card.due)) : undefined,
      sooner: cards.some((card) => card.sooner),
      picture: cards[0] && {
        cardId: cards[0].id,
        state: this.pictureState(cards[0].id),
        url: this.pictureOf(cards[0].id),
        fromVideo: cards[0].source.kind === 'video'
      },
      paused: cards.length > 0 && cards.every((card) => card.paused),
      ignored: state === 'ignored'
    }
  }

  /** Recall sooner, for every card of the word: a higher recall target from now on, and a card due
   * later comes halfway closer now. It never counts as forgetting. */
  setSooner(lang: Language, key: string, on: boolean, now = Date.now()): Promise<WordView> {
    const db = database()
    for (const card of this.cardsOf(lang, key)) {
      const row = db.prepare('SELECT fsrs, due, sooner FROM cards WHERE id = ?').get(card.id) as {
        fsrs: string
        due: number
        sooner: number
      }
      if (!!row.sooner === on) continue
      if (on && card.state !== 'new' && row.due > now) {
        const fsrs = revive(row.fsrs)
        const due = now + Math.round((row.due - now) / 2)
        fsrs.due = new Date(due)
        db.prepare(
          'UPDATE cards SET sooner = 1, fsrs = ?, due = ?, revision = revision + 1, updated_at = ? WHERE id = ?'
        ).run(serialize(fsrs), due, now, card.id)
      } else
        db.prepare(
          'UPDATE cards SET sooner = ?, revision = revision + 1, updated_at = ? WHERE id = ?'
        ).run(on ? 1 : 0, now, card.id)
    }
    this.deps.cards.notifyChanged()
    return this.word(lang, key)
  }

  setPaused(lang: Language, key: string, paused: boolean): Promise<WordView> {
    for (const card of this.cardsOf(lang, key))
      this.deps.cards.collection.setPaused(card.id, paused)
    this.deps.cards.notifyChanged()
    return this.word(lang, key)
  }

  // —— Collections ——

  /** The piles: From your videos, and Made by you once there are hand-made cards. Decks brought in
   * from Anki will join them. */
  /** A collection's cards: From your videos (cards from a video), Made by you (the rest). */
  private collectionCards(id: string): Card[] {
    const cards = this.deps.cards.collection.list({ show: 'all' })
    if (id === 'videos') return cards.filter((card) => card.source.kind === 'video')
    if (id === 'made') return cards.filter((card) => card.source.kind !== 'video')
    return []
  }

  collections(now = Date.now()): CollectionView[] {
    const pile = (id: string, name: string, own: Card[]): CollectionView | undefined => {
      if (!own.length) return undefined
      const due = own.filter(
        (card) => !card.paused && card.state !== 'new' && card.due <= now
      ).length
      const top = own.find((card) => !card.paused) ?? own[0]
      return {
        id,
        name,
        cards: own.length,
        due,
        top: { word: wordOf(top), meaning: top.meaning, step: this.stepOf(top) }
      }
    }
    return [
      pile('videos', 'From your videos', this.collectionCards('videos')),
      pile('made', 'Made by you', this.collectionCards('made'))
    ].filter((item): item is CollectionView => !!item)
  }

  /** By video: the videos watched lately that have cards, with their words. */
  videos(lang: Language, now = Date.now()): VideoGroup[] {
    const rows = database()
      .prepare(
        'SELECT id, site, title, last_watched FROM videos WHERE language = ? ORDER BY last_watched DESC LIMIT ?'
      )
      .all(lang, VIDEOS * 3) as {
      id: string
      site: string
      title: string | null
      last_watched: number
    }[]
    const groups: VideoGroup[] = []
    for (const row of rows) {
      const ids = new Set(videoCardIds(row.id))
      if (!ids.size) continue
      const cards = [...ids]
        .map((id) => this.deps.cards.collection.get(id))
        .filter((card): card is NonNullable<typeof card> => !!card)
      const words: VideoGroup['words'] = []
      for (const card of cards) {
        const word = wordOf(card)
        if (!words.some((item) => item.word === word)) words.push({ word, step: this.stepOf(card) })
      }
      const first = cards.find((card) => card.source.kind === 'video')
      groups.push({
        id: row.id,
        title: row.title?.trim() || 'A video',
        site: row.site,
        watched: row.last_watched,
        words,
        cards: cards.length,
        due: cards.filter((card) => card.state !== 'new' && card.due <= now).length,
        line: first?.source.kind === 'video' ? first.source.moment.line.original : undefined
      })
      if (groups.length >= VIDEOS) break
    }
    return groups
  }

  // —— Make a card ——

  /** Make a card's lookup as the learner types: the word's entry (kept, so Keep and the card's back
   * reuse it with no second request). */
  async lookup(
    lang: Language,
    word: string
  ): Promise<{ meaning?: string; entry?: Awaited<ReturnType<Dictionary['entry']>> }> {
    const entry = await this.dictionary.entry(lang, { word }, LOOKUP_WAIT_MS)
    return { meaning: entry?.senses[0], entry }
  }

  /** A card made by hand: the word, what it means, and a line it's used in. Left empty, the meaning and
   * the line come from the word's entry (the one Make a card already looked up: no new request). It's
   * kept under the word's dictionary form, and joins the next review as a new card. */
  async make(value: unknown): Promise<Card> {
    const draft = value as
      Partial<{ language: unknown; word: unknown; meaning: unknown; line: unknown }> | undefined
    const lang = language(draft?.language)
    const word = text(draft?.word, 'The word')
    const entry = await this.dictionary.entry(lang, { word }, LOOKUP_WAIT_MS)
    const meaning =
      typeof draft?.meaning === 'string' && draft.meaning.trim()
        ? draft.meaning.trim().slice(0, MAX_TEXT)
        : entry?.senses[0]
    if (!meaning) throw new Error('Write what it means.')
    const typed = typeof draft?.line === 'string' ? draft.line.trim().slice(0, MAX_TEXT) : ''
    const example: Card['example'] = typed
      ? { line: typed, byDuet: false }
      : entry?.example && { line: entry.example.line, byDuet: true }
    const result = this.deps.cards.saveDraft({
      type: 'understand',
      expression: word,
      meaning,
      target: word,
      language: lang,
      source: { kind: 'tutor' },
      wordKey: wordKey(lang, entry?.word ?? word)
    })
    const card = 'saved' in result ? result.saved : result.duplicate
    if (example) {
      database()
        .prepare('UPDATE cards SET example = ? WHERE id = ?')
        .run(JSON.stringify(example), card.id)
      this.deps.cards.notifyChanged()
    }
    return this.card(card.id)
  }

  // —— Pictures ——

  /** A picture card's picture: captured from the video (the page asked first), uploaded, generated,
   * or none. Returns the picture, or undefined (none, or the learner cancelled). */
  async setPicture(cardId: string, from: PictureSource): Promise<string | undefined> {
    const card = this.card(cardId)
    let picture: string | undefined
    if (from === 'upload') picture = await uploadPicture(this.deps.window())
    else if (from === 'generate') picture = await generatePicture(wordOf(card), card.meaning)
    else if (from === 'capture') {
      if (card.source.kind !== 'video') throw new Error('This card isn’t from a video.')
      const { video } = card.source.moment
      const open = this.deps.currentVideo()
      if (!open || open.site !== video.site || open.id !== video.id)
        throw new Error('Open the video in your browser first, then capture the still.')
      // Back to the word's moment, then the still once the frame is there.
      this.deps.replay(card.source.moment)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      picture = await captureStill(open.title ?? video.title ?? '')
    } else if (from !== 'none') throw new Error('That isn’t a way to get a picture.')
    if (from === 'none' || picture) {
      database()
        .prepare('UPDATE cards SET picture = ?, updated_at = ? WHERE id = ?')
        .run(picture ?? 'none', Date.now(), card.id)
      this.deps.cards.notifyChanged()
    }
    return picture
  }

  /** Whether the card's picture was decided (a picture, or none), for the editor. */
  pictureState(cardId: string): 'set' | 'none' | 'unset' {
    const row = database().prepare('SELECT picture FROM cards WHERE id = ?').get(cardId) as
      { picture: string | null } | undefined
    return !row?.picture ? 'unset' : row.picture === 'none' ? 'none' : 'set'
  }
}
