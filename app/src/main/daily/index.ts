// The daily session, main-process side: today's plan (plan.ts) from the last video watched, and the
// steps after the reviews: Duet says a line and hears the learner say it back, then recall a word or
// what did they mean. The page only names a step; the plan, the line and the answers stay here, so
// the page can't have Duet speak or judge text of its choosing. Finishing keeps the day's streak.
//
// IPC (from the home page only; window.duet.daily in src/preload/daily.ts):
//   daily:plan             → SessionView: today's plan (a new one each time it's asked for)
//   daily:speak            → SessionAudio: Duet saying the line
//   daily:coach            the learner's recording (WAV) → LineAttempt: what was heard, a note
//   daily:check-recall     the word picked → { correct, answer }; a miss becomes a card (Cards.missed)
//   daily:meaning-question → { question }
//   daily:meaning-check    the learner's answer → { note }
//   daily:done             → the streak, with today kept
//   daily:set-reminder     the daily reminder's time ("19:30"), or null for none
import { ipcMain, type WebContents } from 'electron'
import type { CardDraft } from '../../shared/cards'
import type { SessionAudio, SessionView } from '../../shared/daily'
import type { DueCounts } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import type { LastVideo, WordEvent } from '../watchlog'
import type { Streak } from '../watchlog/streak'
import { planSession } from './plan'
import type { Quiz } from './quiz'
import { parseReminder } from './reminder'
import { challengeView, NO_KEY, Round } from './round'

type Deps = {
  log: { lastVideo(): LastVideo | undefined; markSessionDone(): void; streak(): Streak; noteWord(event: WordEvent): unknown }
  cards: { counts(): DueCounts; missed(draft: CardDraft): unknown }
  voice?: { tts: TextToSpeech; coach: PronunciationCoach }
  quiz?: Quiz
  /** Whether a message came from the home page. */
  owns: (sender: WebContents) => boolean
  /** Saves the daily reminder's time (none: off). */
  setReminder: (time: string | undefined) => void
  random?: () => number
}

export class DailySession {
  private round?: Round
  private video?: LastVideo

  constructor({ log, cards, voice, quiz, owns, setReminder, random = Math.random }: Deps) {
    // Every step is the home page's, and works on the plan made for it.
    const handle = (channel: string, work: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(`daily:${channel}`, (event, ...args) => {
        if (!owns(event.sender)) throw new Error('Not allowed: the daily session runs in the home base.')
        return work(...args)
      })
    }
    const round = (): Round => {
      if (!this.round) throw new Error('Start today’s session first.')
      return this.round
    }

    handle('plan', (): SessionView => {
      const video = (this.video = log.lastVideo())
      const { due, newAvailable } = cards.counts()
      const plan = planSession({ due: due + newAvailable, lines: video?.lines ?? [], words: video?.words ?? [], random })
      this.round = new Round({ cards, log, coach: voice?.coach, quiz }, video, plan.say, plan.challenge)
      return {
        cards: plan.cards,
        video: video?.title,
        say: plan.say && { original: plan.say.original, translation: plan.say.translation },
        challenge: challengeView(plan.challenge)
      }
    })
    handle('speak', async (): Promise<SessionAudio> => {
      const line = round().say
      if (!line || !this.video) throw new Error('Today’s session has no line to say.')
      if (!voice) throw new Error(NO_KEY)
      return voice.tts.speak(line.original, this.video.language)
    })
    handle('coach', (clip) => round().coach(clip))
    handle('check-recall', (choice) => round().checkRecall(choice))
    handle('meaning-question', () => round().meaningQuestion())
    handle('meaning-check', (answer) => round().meaningCheck(answer))
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
