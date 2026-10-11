// Checkpoints, main-process side: offered at a pause the learner makes or a natural break, the end of
// a scene or conversation judged from the dialogue (triggers.ts, scenes.ts), shown as a glow on the
// strip; one challenge from the last few minutes of the video when the strip is clicked
// (src/main/challenges/pick.ts). The video waits while one is open. A miss becomes a card; finishing
// keeps the day. Off unless turned on in Settings; Duet turns them on itself after the third video
// watched, unless the learner chose.
//
// IPC (from the strip only; window.duet.checkpoint in src/preload/checkpoint.ts):
//   checkpoint:offer          ← 'pause' | 'break' while one is offered (the strip glows), else null
//   checkpoint:closed         ← the open checkpoint was closed by Duet (another video): drop it
//   checkpoint:open           → CheckpointView: the challenge (only while one is offered)
//   checkpoint:speak, checkpoint:coach, checkpoint:check-recall, checkpoint:meaning-question,
//   checkpoint:meaning-check  the challenge steps (src/main/challenges/ipc.ts)
//   checkpoint:done           finished: keeps the day, and lets the video go
//   checkpoint:close          closed without finishing: lets the video go
import type { WebContents } from 'electron'
import type { EventEmitter } from 'events'
import type { CardDraft } from '../../shared/cards'
import type { CheckpointView, Offer } from '../../shared/checkpoints'
import type { Language, OverlayLine, Script } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import { connectRound } from '../challenges/ipc'
import { pickCheckpoint } from '../challenges/pick'
import type { Quiz } from '../challenges/quiz'
import { challengeView, Round, sayView } from '../challenges/round'
import { ownedHandler } from '../ipc/owned'
import type { Holder } from '../player'
import { videoKey, type VideoLines, type WatchedVideo, type WordEvent } from '../watchlog'
import { SceneTracker, type SceneJudge } from './scenes'
import { CheckpointTriggers } from './triggers'

// A checkpoint uses the lines met in this last stretch of the video.
const RECENT_MS = 5 * 60_000
// Whether there are such lines is checked this often, not on every tick.
const CONTENT_EVERY_MS = 5_000
// Checkpoints turn on by themselves once this many videos have been watched.
const AUTO_ON_VIDEOS = 3
const AUTO_ON_EVERY_MS = 60_000
// Duet's own holds: a pause made by one of these is not the learner's.
const DUET_HOLDS: Holder[] = ['wait', 'tutor', 'explain', 'checkpoint']

type Deps = {
  watcher: EventEmitter & { currentVideo?: WatchedVideo; script?: Script }
  player: { playing: boolean; isHeldBy(holder: Holder): boolean; hold(holder: Holder): void; release(holder: Holder): void }
  settings: EventEmitter & { current: { checkpoints?: boolean; language: Language }; update(change: { checkpoints: boolean }): void }
  log: {
    videoLines(key: string, since: number): VideoLines | undefined
    hasLinesSince(key: string, since: number): boolean
    videoCount(): number
    noteWord(event: WordEvent): unknown
    markCheckpointDone(): void
  }
  cards: { missed(draft: CardDraft): unknown }
  voice?: { tts: TextToSpeech; coach: PronunciationCoach }
  quiz?: Quiz
  /** Finds where scenes end; without it, checkpoints come at pauses only. */
  scenes?: SceneJudge
  /** The strip's window: whether a message came from it, and sending to it. */
  overlay: { owns(sender: WebContents): boolean; send(channel: string, value: unknown): void }
  random?: () => number
}

export class Checkpoints {
  private readonly triggers = new CheckpointTriggers()
  private readonly scenes?: SceneTracker
  private offer?: Offer
  private shownVideo?: string
  private content?: { key: string; at: number; ready: boolean }
  private autoCheckedAt?: number
  private round?: Round

  constructor(private readonly deps: Deps) {
    const { watcher, player, settings, log, cards, voice, quiz, overlay, random = Math.random } = deps
    if (deps.scenes) {
      const scenes = new SceneTracker(deps.scenes, () => this.key(), () => settings.current.language)
      this.scenes = scenes
      // The transcript goes to the scene model only while checkpoints are on.
      const split = (): void => {
        if (this.on() && watcher.script) scenes.split(watcher.script)
      }
      watcher.on('script', split)
      settings.on('change', split)
      watcher.on('current', (id: number | null) => scenes.current(id))
      watcher.on('line', (line: OverlayLine) => scenes.line(line))
    }

    const handle = ownedHandler('checkpoint', overlay.owns, 'Not allowed: checkpoints open from the strip.')
    connectRound(handle, () => {
      if (!this.round) throw new Error('No checkpoint is open.')
      return this.round
    })
    handle('open', (): CheckpointView => {
      const key = this.key()
      const video = key ? log.videoLines(key, Date.now() - RECENT_MS) : undefined
      if (!this.offer || !video?.lines.length) throw new Error('No checkpoint to open right now.')
      this.triggers.accept()
      this.setOffer(undefined)
      player.hold('checkpoint')
      // A word the learner looked at, recalled; else, by turns, a line said back or what it meant.
      const { say, challenge } = pickCheckpoint(video, random)
      this.round = new Round({ cards, log, tts: voice?.tts, coach: voice?.coach, quiz }, video, say, challenge)
      return { ...(say ? { kind: 'say' as const, ...sayView(say) } : challengeView(challenge)!), video: video.title }
    })
    handle('done', () => {
      if (!this.round) throw new Error('No checkpoint is open.')
      log.markCheckpointDone()
      this.close()
    })
    handle('close', () => this.close())
  }

  /** Call often (index.ts's main loop): offers a checkpoint when it's time, and turns them on after
   * the third video. */
  tick(now = Date.now()): void {
    const { player } = this.deps
    this.autoOn(now)
    const key = this.key()
    // Another video: a checkpoint open on the last one is closed, and the strip drops it.
    if (key !== this.shownVideo) {
      this.shownVideo = key
      if (this.round) {
        this.close()
        this.deps.overlay.send('checkpoint:closed', null)
      }
    }
    if (!this.on()) return this.setOffer(undefined)
    if (this.triggers.ready(now)) this.scenes?.judgePause(now)
    this.setOffer(
      this.triggers.tick({
        now,
        video: key,
        playing: player.playing,
        heldByDuet: DUET_HOLDS.some((holder) => player.isHeldBy(holder)),
        sceneEndedAt: this.scenes?.endedAt,
        canOffer: !!key && this.hasContent(key, now),
        open: !!this.round
      })
    )
  }

  /** The strip's page reloaded or crashed: its open checkpoint is closed, and the offer standing (if
   * any) is sent again on the next tick. */
  reset(): void {
    if (this.round) this.close()
    this.offer = undefined
  }

  private on(): boolean {
    return this.deps.settings.current.checkpoints === true
  }

  private key(): string | undefined {
    const video = this.deps.watcher.currentVideo
    return video && videoKey(video)
  }

  /** Whether the last few minutes of this video have lines to make a checkpoint from. */
  private hasContent(key: string, now: number): boolean {
    if (this.content?.key !== key || now - this.content.at >= CONTENT_EVERY_MS)
      this.content = { key, at: now, ready: this.deps.log.hasLinesSince(key, now - RECENT_MS) }
    return this.content.ready
  }

  /** Checkpoints on by themselves once enough videos are watched, unless the learner chose. */
  private autoOn(now: number): void {
    const { settings, log } = this.deps
    if (settings.current.checkpoints !== undefined) return
    if (this.autoCheckedAt !== undefined && now - this.autoCheckedAt < AUTO_ON_EVERY_MS) return
    this.autoCheckedAt = now
    if (log.videoCount() >= AUTO_ON_VIDEOS) settings.update({ checkpoints: true })
  }

  private setOffer(offer: Offer | undefined): void {
    if (offer === this.offer) return
    this.offer = offer
    this.deps.overlay.send('checkpoint:offer', offer ?? null)
  }

  private close(): void {
    this.round = undefined
    this.deps.player.release('checkpoint')
  }
}
