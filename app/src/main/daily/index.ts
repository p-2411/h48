// The daily session, main-process side: today's plan (plan.ts) from the last video watched, and the
// steps after the reviews: Duet says a line and hears the learner say it back, then recall a word or
// what did they mean. The page only names a step; the plan, the line and the answers stay here, so
// the page can't have Duet speak or judge text of its choosing. Finishing keeps the day's streak.
//
// IPC (from the home page only; window.duet.daily in src/preload/daily.ts):
//   daily:plan             → SessionView: today's plan (a new one each time it's asked for)
//   daily:speak, daily:coach, daily:check-recall, daily:meaning-question, daily:meaning-check
//                            the challenge steps (src/main/challenges/ipc.ts)
//   daily:done             → { kept, streak }: today is kept only when something was done
//                            (a card reviewed, the line said, the challenge answered)
import type { WebContents } from 'electron'
import type { CardDraft } from '../../shared/cards'
import type { SessionView } from '../../shared/daily'
import { reviewableNow, type DueCounts } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import { connectRound } from '../challenges/ipc'
import type { Quiz } from '../challenges/quiz'
import { ownedHandler } from '../ipc/owned'
import { challengeView, Round, sayView } from '../challenges/round'
import type { VideoLines, WordEvent } from '../watchlog'
import type { Streak } from '../watchlog/streak'
import { planSession } from './plan'

type Deps = {
  log: { lastVideo(): VideoLines | undefined; markSessionDone(): void; streak(): Streak; noteWord(event: WordEvent): unknown }
  cards: { counts(): DueCounts; missed(draft: CardDraft): unknown; reviewsSince(at: number): number }
  voice?: { tts: TextToSpeech; coach: PronunciationCoach }
  quiz?: Quiz
  /** Whether a message came from the home page. */
  owns: (sender: WebContents) => boolean
  random?: () => number
}

export class DailySession {
  private round?: Round
  // When this session's plan was made: reviews since count as done in it.
  private plannedAt = 0

  constructor({ log, cards, voice, quiz, owns, random = Math.random }: Deps) {
    // Every step is the home page's, and works on the plan made for it.
    const handle = ownedHandler('daily', owns, 'Not allowed: the daily session runs in the home base.')
    connectRound(handle, () => {
      if (!this.round) throw new Error('Start today’s session first.')
      return this.round
    })
    handle('plan', (): SessionView => {
      const video = log.lastVideo()
      const plan = planSession({ due: reviewableNow(cards.counts()), lines: video?.lines ?? [], words: video?.words ?? [], random })
      this.round = new Round({ cards, log, tts: voice?.tts, coach: voice?.coach, quiz }, video, plan.say, plan.challenge)
      this.plannedAt = Date.now()
      return { cards: plan.cards, video: video?.title, say: plan.say && sayView(plan.say), challenge: challengeView(plan.challenge) }
    })
    handle('done', () => {
      const kept = !!this.round?.finished || cards.reviewsSince(this.plannedAt) > 0
      if (kept) log.markSessionDone()
      return { kept, streak: log.streak() }
    })
  }
}
