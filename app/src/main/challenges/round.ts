// One round of challenges on lines the learner met: a line said back (and coached), a word recalled
// (a miss becomes a card) and what a line meant (asked and marked). The daily session (src/main/daily)
// and checkpoints (src/main/checkpoints) each hold one; ipc.ts registers its steps. It keeps the answers, so the page only names a
// step and sends its answer.
import type { CardDraft } from '../../shared/cards'
import type { LineAttempt, RecallResult, SayView, SessionAudio, SessionView } from '../../shared/daily'
import type { Moment } from '../../shared/moment'
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

/** What the page is shown of a challenge: no answers. */
export function challengeView(challenge?: Challenge): SessionView['challenge'] {
  if (challenge?.kind === 'recall') {
    const { before, after, spaceBefore, spaceAfter, choices } = challenge.recall
    return { kind: 'recall', before, after, spaceBefore, spaceAfter, choices, translation: challenge.line.translation }
  }
  return challenge && { kind: 'meaning', original: challenge.line.original }
}

export class Round {
  // A recall missed once is one miss, however many wrong picks follow.
  private missed = false
  // The missed word is in the cards now (its card made or brought forward).
  private carded = false
  /** The learner finished a step: said the line, picked a word or answered the question. */
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
    return attempt
  }

  /** Whether the word picked is the one; a miss becomes a card, or its card comes due now. */
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
    return { correct, answer, carded: !correct && this.carded }
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
