// The daily session, main-process side: today's plan (plan.ts) from the last video watched, and the
// steps after the reviews: Duet says a line and hears the learner say it back, then recall a word or
// what did they mean. The page only names a step; the plan, the line and the answers stay here, so
// the page can't have Duet speak or judge text of its choosing. Finishing keeps the day's streak.
//
// IPC (from the home page only; window.duet.daily in src/preload/daily.ts):
//   daily:plan             → SessionView: today's plan (a new one each time it's asked for)
//   daily:speak            → SessionAudio: Duet saying the line
//   daily:coach            the learner's recording (WAV) → LineAttempt: what was heard, a note
//   daily:check-recall     the word picked → { correct, answer }
//   daily:meaning-question → { question }
//   daily:meaning-check    the learner's answer → { note }
//   daily:done             → the streak, with today kept
//   daily:set-reminder     the daily reminder's time ("19:30"), or null for none
import { ipcMain, type WebContents } from 'electron'
import type { SessionAudio, SessionView } from '../../shared/daily'
import type { DueCounts, Language } from '../../shared/types'
import type { LineAttempt, PronunciationCoach, TextToSpeech } from '../ai/voice'
import type { Streak } from '../watchlog/streak'
import type { LastVideo } from '../watchlog'
import { planSession, type SessionPlan } from './plan'
import type { Quiz } from './quiz'
import { parseReminder } from './reminder'

// A recording longer than this (about 3 minutes of WAV) is not a line said back.
const MAX_RECORDING_BYTES = 12 * 1024 * 1024
const MAX_ANSWER = 1_000
const NO_KEY = 'Add OPENAI_API_KEY to app/.env.local for the speaking and quiz steps.'

type Deps = {
  log: { lastVideo(): LastVideo | undefined; markSessionDone(): void; streak(): Streak }
  cards: { counts(): DueCounts }
  voice?: { tts: TextToSpeech; coach: PronunciationCoach }
  quiz?: Quiz
  /** Whether a message came from the home page. */
  owns: (sender: WebContents) => boolean
  /** Saves the daily reminder's time (none: off). */
  setReminder: (time: string | undefined) => void
  random?: () => number
}

/** The view of a plan the page is given: no answers. */
function view(plan: SessionPlan, video?: LastVideo): SessionView {
  const { challenge } = plan
  return {
    cards: plan.cards,
    video: video?.title,
    say: plan.say && { original: plan.say.original, translation: plan.say.translation },
    challenge:
      challenge?.kind === 'recall'
        ? {
            kind: 'recall',
            before: challenge.recall.before,
            after: challenge.recall.after,
            spaceBefore: challenge.recall.spaceBefore,
            spaceAfter: challenge.recall.spaceAfter,
            choices: challenge.recall.choices,
            translation: challenge.line.translation
          }
        : challenge && { kind: 'meaning', original: challenge.line.original }
  }
}

export class DailySession {
  private plan?: SessionPlan
  private language: Language = 'es'
  private question?: string

  constructor({ log, cards, voice, quiz, owns, setReminder, random = Math.random }: Deps) {
    // Every step is the home page's, and works on the plan made for it.
    const handle = (channel: string, work: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(`daily:${channel}`, (event, ...args) => {
        if (!owns(event.sender)) throw new Error('Not allowed: the daily session runs in the home base.')
        return work(...args)
      })
    }
    const planned = (): SessionPlan => {
      if (!this.plan) throw new Error('Start today’s session first.')
      return this.plan
    }

    handle('plan', (): SessionView => {
      const video = log.lastVideo()
      const { due, newAvailable } = cards.counts()
      this.plan = planSession({ due: due + newAvailable, lines: video?.lines ?? [], words: video?.words ?? [], random })
      this.language = video?.language ?? this.language
      this.question = undefined
      return view(this.plan, video)
    })
    handle('speak', async (): Promise<SessionAudio> => {
      const line = planned().say
      if (!line) throw new Error('Today’s session has no line to say.')
      if (!voice) throw new Error(NO_KEY)
      return voice.tts.speak(line.original, this.language)
    })
    handle('coach', async (clip): Promise<LineAttempt> => {
      const line = planned().say
      if (!line) throw new Error('Today’s session has no line to say.')
      const recording = clip as Partial<SessionAudio> | undefined
      if (!(recording?.data instanceof Uint8Array) || !recording.data.length || recording.data.length > MAX_RECORDING_BYTES)
        throw new Error('That recording could not be used. Try recording again.')
      if (!voice) throw new Error(NO_KEY)
      return voice.coach.coach({ data: recording.data, mimeType: 'audio/wav' }, { original: line.original, translation: line.translation, language: this.language })
    })
    handle('check-recall', (choice) => {
      const challenge = planned().challenge
      if (challenge?.kind !== 'recall') throw new Error('Today’s session has no word to recall.')
      return { correct: choice === challenge.recall.answer, answer: challenge.recall.answer }
    })
    handle('meaning-question', async () => {
      const challenge = planned().challenge
      if (challenge?.kind !== 'meaning') throw new Error('Today’s session has no line to ask about.')
      if (!quiz) throw new Error(NO_KEY)
      this.question = await quiz.ask(challenge.line, this.language)
      return { question: this.question }
    })
    handle('meaning-check', async (answer) => {
      const challenge = planned().challenge
      if (challenge?.kind !== 'meaning' || !this.question) throw new Error('Ask the question first.')
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Write an answer first.')
      if (!quiz) throw new Error(NO_KEY)
      return quiz.mark(challenge.line, this.question, answer.trim().slice(0, MAX_ANSWER), this.language)
    })
    handle('set-reminder', (time) => {
      const parsed = parseReminder(time)
      if (time !== null && !parsed) throw new Error('Pick a time for the reminder, like 19:30.')
      setReminder(parsed)
    })
    handle('done', () => {
      log.markSessionDone()
      return log.streak()
    })
  }
}
