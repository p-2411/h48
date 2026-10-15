// One round of challenges on lines the learner met: a line said back (and coached), a word recalled
// (a miss becomes a card), what a line meant (asked and marked) and a sentence of the learner's own
// after a line (judged word by word). The daily session (src/main/daily) and checkpoints
// (src/main/checkpoints) each hold one; ipc.ts registers its steps. It keeps the answers, so the
// page only names a step and sends its answer. What the learner does feeds the knowledge ladder.
import type { CardDraft } from '../../shared/cards'
import type { LineAttempt, MeaningView, RecallResult, RecallView, SayView, SessionAudio, SessionView } from '../../shared/daily'
import { pairKeys } from '../../shared/knowledge'
import type { Moment } from '../../shared/moment'
import type { Language } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import { draftFromMoment } from '../cards/drafts'
import type { Knowledge, WordAttempt } from '../knowledge'
import type { VideoLines, MetLine, WordEvent } from '../watchlog'
import type { Challenge } from './pick'
import type { Quiz } from './quiz'

// A recording longer than this (about 3 minutes of WAV) is not a line said back.
const MAX_RECORDING_BYTES = 12 * 1024 * 1024
const MAX_ANSWER = 1_000
const NO_KEY = 'Sign in to Duet for the speaking and quiz steps.'

/** The video a round's lines come from. */
type RoundVideo = Pick<VideoLines, 'key' | 'site' | 'videoId' | 'title' | 'language'>

type RoundDeps = {
  cards: { missed(draft: CardDraft): unknown }
  log: { noteWord(event: WordEvent): unknown }
  /** The knowledge ladder: what the learner did with each word (src/main/knowledge). */
  knowledge?: Pick<Knowledge, 'noteAttempts'>
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

/** The words a sentence of the learner's own may use: those of the plan's pairs (the words not
 * ignored), once each. */
function usableWords(challenge: Extract<Challenge, { kind: 'produce' }>, language: Language): { key: string; text: string }[] {
  const words = pairKeys(language, challenge.line.processed).filter((word) => challenge.pairs.includes(word.pair))
  return words.filter((word, index) => words.findIndex((other) => other.key === word.key) === index)
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
    return { kind: 'produce', original, translation, words: usableWords(challenge, language).map((word) => word.text) }
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
  // The learner's sentence has been judged: one per line, or a second would be a second context at once.
  private produced = false
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
    if (attempt.heard)
      this.note(pairKeys(this.video.language, line.processed).map((word) => ({ key: word.key, kind: 'say', good: attempt.good })))
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
      if (word) this.note([{ key: word.key, kind: 'recall', good: correct }])
    }
    return { correct, answer, carded: !correct && this.carded }
  }

  /** A sentence of the learner's own after the line: each of the line's words used in it is
   * evidence (used well or not, with the sentence as its context). */
  async produceCheck(sentence: unknown): Promise<{ note: string; used: string[] }> {
    const challenge = this.challenge
    if (challenge?.kind !== 'produce' || !this.video) throw new Error('There is no line to follow.')
    if (this.produced) throw new Error('You have already written your sentence for this line.')
    if (typeof sentence !== 'string' || !sentence.trim()) throw new Error('Write a sentence first.')
    if (!this.deps.quiz) throw new Error(NO_KEY)
    const own = sentence.trim().slice(0, MAX_ANSWER)
    const words = usableWords(challenge, this.video.language)
    const judged = await this.deps.quiz.use(challenge.line, own, words.map((word) => word.text), this.video.language)
    this.produced = true
    this.finished = true
    // One try per word: used if the model says so anywhere, good only if every use was right.
    const tries = words.flatMap((word) => {
      const said = judged.words.filter((verdict) => verdict.word === word.text && verdict.used)
      return said.length ? [{ key: word.key, text: word.text, good: said.every((verdict) => verdict.correct) }] : []
    })
    this.note(tries.map(({ key, good }) => ({ key, kind: 'use', good, context: own })))
    return { note: judged.note, used: tries.filter((item) => item.good).map((item) => item.text) }
  }

  /** What the learner did, on the knowledge ladder; a write that fails is reported, and the step's
   * answer (paid for already) still reaches the learner. */
  private note(attempts: WordAttempt[]): void {
    if (!this.video) return
    try {
      this.deps.knowledge?.noteAttempts(this.video.language, attempts)
    } catch (error) {
      console.error('[duet] could not note what the learner did on the knowledge ladder', error)
    }
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
