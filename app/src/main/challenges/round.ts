// One round of challenges on lines the learner met: a line said back (and coached), a word recalled
// (a miss becomes a card), what a line meant (asked and marked) and a sentence of the learner's own
// after a line (judged word by word). The daily session (src/main/daily) and checkpoints
// (src/main/checkpoints) each hold one; ipc.ts registers its steps. It keeps the answers, so the
// page only names a step and sends its answer. What the learner does feeds the knowledge ladder.
import type { CardDraft } from '../../shared/cards'
import type { LineAttempt, MeaningView, RecallResult, RecallView, SayView, SessionAudio, SessionView } from '../../shared/daily'
import { IGNORED_JOBS, pairKeys } from '../../shared/knowledge'
import type { Moment } from '../../shared/moment'
import type { Language } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import { draftFromMoment } from '../cards/drafts'
import type { VideoLines, MetLine, WordEvent } from '../watchlog'
import type { Challenge } from './pick'
import type { Quiz } from './quiz'

// A recording longer than this (about 3 minutes of WAV) is not a line said back.
const MAX_RECORDING_BYTES = 12 * 1024 * 1024
const MAX_ANSWER = 1_000
const NO_KEY = 'Add OPENAI_API_KEY to app/.env.local for the speaking and quiz steps.'

/** The video a round's lines come from. */
type RoundVideo = Pick<VideoLines, 'key' | 'site' | 'videoId' | 'title' | 'language'>

type RoundDeps = {
  cards: { missed(draft: CardDraft): unknown }
  log: { noteWord(event: WordEvent): unknown }
  /** The knowledge ladder: what the learner did with each word (src/main/knowledge). */
  knowledge?: { noteAttempt(language: Language, key: string, kind: 'recall' | 'say' | 'use', good: boolean, context?: string): void }
  tts?: TextToSpeech
  coach?: PronunciationCoach
  quiz?: Quiz
}

/** A line from a video as a moment, the shape a card's source has. */
function momentOf(video: RoundVideo, line: MetLine, now = Date.now()): Moment {
  return {
    language: video.language,
    line: { id: line.id, original: line.original, at: now, start: line.start, state: 'ready', processed: line.processed },
    earlier: [],
    video: { site: video.site, id: video.videoId, title: video.title, position: line.start },
    takenAt: now
  }
}

/** What the page is shown of the line to say back. */
export function sayView(line: MetLine): SayView {
  return { original: line.original, translation: line.translation }
}

/** The words of a line a sentence of the learner's own can use: names and grammar words aside. */
function usableWords(line: MetLine, language: Language): { key: string; text: string }[] {
  return pairKeys(language, line.processed).filter((word) => !IGNORED_JOBS.includes(word.job))
}

/** What the page is shown of a challenge: no answers. */
export function challengeView(challenge: Exclude<Challenge, { kind: 'produce' }> | undefined, language: Language): RecallView | MeaningView | undefined
export function challengeView(challenge: Challenge | undefined, language: Language): SessionView['challenge']
export function challengeView(challenge: Challenge | undefined, language: Language): SessionView['challenge'] {
  if (challenge?.kind === 'recall') {
    const { before, after, spaceBefore, spaceAfter, choices } = challenge.recall
    return { kind: 'recall', before, after, spaceBefore, spaceAfter, choices, translation: challenge.line.translation }
  }
  if (challenge?.kind === 'produce') {
    const { original, translation } = challenge.line
    return { kind: 'produce', original, translation, words: usableWords(challenge.line, language).map((word) => word.text) }
  }
  return challenge && { kind: 'meaning', original: challenge.line.original }
}

export class Round {
  // A recall missed once is one miss, however many wrong picks follow.
  private missed = false
  // The recall's first pick has been noted on the knowledge ladder.
  private recalled = false
  // The missed word is in the cards now (its card made or brought forward).
  private carded = false
  /** The learner finished a step: said the line, picked a word, answered the question or wrote a
   * sentence. */
  finished = false
  private question?: string

  constructor(
    private readonly deps: RoundDeps,
    private readonly video: RoundVideo | undefined,
    readonly say: MetLine | undefined,
    readonly challenge: Challenge | undefined
  ) {}

  /** Duet saying the line, for the learner to say it back. */
  async speak(): Promise<SessionAudio> {
    const line = this.say
    if (!line || !this.video) throw new Error('There is no line to say.')
    if (!this.deps.tts) throw new Error(NO_KEY)
    return this.deps.tts.speak(line.original, this.video.language)
  }

  /** How the learner said the line back. */
  async coach(clip: unknown): Promise<LineAttempt> {
    const line = this.say
    if (!line || !this.video) throw new Error('There is no line to say.')
    const recording = clip as Partial<SessionAudio> | undefined
    if (!(recording?.data instanceof Uint8Array) || !recording.data.length || recording.data.length > MAX_RECORDING_BYTES)
      throw new Error('That recording could not be used. Try recording again.')
    if (!this.deps.coach) throw new Error(NO_KEY)
    const attempt = await this.deps.coach.coach(
      { data: recording.data, mimeType: 'audio/wav' },
      { original: line.original, translation: line.translation, language: this.video.language }
    )
    this.finished = true
    // Each word of the line was said, well or not (nothing heard is no evidence).
    if (attempt.heard) {
      for (const word of pairKeys(this.video.language, line.processed))
        this.deps.knowledge?.noteAttempt(this.video.language, word.key, 'say', attempt.good)
    }
    return attempt
  }

  /** Whether the word picked is the one; a miss becomes a card. `carded` says whether the missed
   * word is in the cards now (false when it was right, or the card couldn't be made). */
  checkRecall(choice: unknown): RecallResult {
    const challenge = this.challenge
    if (challenge?.kind !== 'recall') throw new Error('There is no word to recall.')
    const { answer, pair } = challenge.recall
    const correct = choice === answer
    this.finished = true
    if (!correct && !this.missed && this.video) {
      this.missed = true
      // The answer is shown either way; a card that couldn't be made is reported, not thrown.
      try {
        const draft = draftFromMoment(momentOf(this.video, challenge.line), pair)
        if (draft) {
          this.deps.cards.missed(draft)
          this.carded = true
        }
      } catch (error) {
        console.error('[duet] could not make a card of the missed word', error)
      }
      try {
        this.deps.log.noteWord({
          kind: 'missed',
          videoKey: this.video.key,
          language: this.video.language,
          text: answer,
          line: challenge.line.original,
          start: challenge.line.start
        })
      } catch (error) {
        console.error('[duet] could not log the missed word', error)
      }
    }
    // Each pick is evidence about the word (the first is what counts; a second pick after a miss
    // adds nothing new).
    if (!this.recalled && this.video) {
      this.recalled = true
      const word = pairKeys(this.video.language, challenge.line.processed).find((item) => item.pair === pair)
      if (word) this.deps.knowledge?.noteAttempt(this.video.language, word.key, 'recall', correct)
    }
    return { correct, answer, carded: !correct && this.carded }
  }

  /** A sentence of the learner's own after the line: each of the line's words used in it is
   * evidence (used well or not, with the sentence as its context). */
  async produceCheck(sentence: unknown): Promise<{ note: string; used: string[] }> {
    const challenge = this.challenge
    if (challenge?.kind !== 'produce' || !this.video) throw new Error('There is no line to follow.')
    if (typeof sentence !== 'string' || !sentence.trim()) throw new Error('Write a sentence first.')
    if (!this.deps.quiz) throw new Error(NO_KEY)
    const own = sentence.trim().slice(0, MAX_ANSWER)
    const language = this.video.language
    const words = usableWords(challenge.line, language)
    const judged = await this.deps.quiz.use(challenge.line, own, words.map((word) => word.text), language)
    this.finished = true
    const used: string[] = []
    for (const verdict of judged.words) {
      const word = words.find((item) => item.text === verdict.word)
      if (!word || !verdict.used) continue
      this.deps.knowledge?.noteAttempt(language, word.key, 'use', verdict.correct, own)
      if (verdict.correct) used.push(word.text)
    }
    return { note: judged.note, used }
  }

  /** The question about what the line meant. */
  async meaningQuestion(): Promise<{ question: string }> {
    const challenge = this.challenge
    if (challenge?.kind !== 'meaning' || !this.video) throw new Error('There is no line to ask about.')
    if (!this.deps.quiz) throw new Error(NO_KEY)
    this.question = await this.deps.quiz.ask(challenge.line, this.video.language)
    return { question: this.question }
  }

  /** A note on the learner's answer to it. */
  async meaningCheck(answer: unknown): Promise<{ note: string }> {
    const challenge = this.challenge
    if (challenge?.kind !== 'meaning' || !this.question || !this.video) throw new Error('Ask the question first.')
    if (typeof answer !== 'string' || !answer.trim()) throw new Error('Write an answer first.')
    if (!this.deps.quiz) throw new Error(NO_KEY)
    const marked = await this.deps.quiz.mark(challenge.line, this.question, answer.trim().slice(0, MAX_ANSWER), this.video.language)
    this.finished = true
    return marked
  }
}
