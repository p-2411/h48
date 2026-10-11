// Checkpoints, main-process side: offered at a pause the learner makes or a natural break, the end of
// a scene or conversation judged from the dialogue (triggers.ts, scenes.ts), shown as a glow on the strip; one challenge from the last few minutes of the video
// when the strip is clicked: recall a word the learner looked at, else say a line back or what a
// line meant. The video waits while one is open. A miss becomes a card; finishing keeps the day.
// Off unless turned on in Settings; Duet turns them on itself after the third video watched, unless
// the learner chose.
//
// IPC (from the strip only; window.duet.checkpoint in src/preload/checkpoint.ts):
//   checkpoint:offer          ← 'pause' | 'break' while one is offered (the strip glows), else null
//   checkpoint:open           → CheckpointView: the challenge (only while one is offered)
//   checkpoint:speak          → SessionAudio: Duet saying the line
//   checkpoint:coach          the learner's recording (WAV) → LineAttempt
//   checkpoint:check-recall   the word picked → { correct, answer }
//   checkpoint:meaning-question / checkpoint:meaning-check
//   checkpoint:done           finished: keeps the day, and lets the video go
//   checkpoint:close          closed without finishing: lets the video go
import { ipcMain, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { EventEmitter } from 'events'
import type { CardDraft } from '../../shared/cards'
import type { CheckpointView } from '../../shared/checkpoints'
import type { SessionAudio } from '../../shared/daily'
import type { Language, OverlayLine, Script } from '../../shared/types'
import type { PronunciationCoach, TextToSpeech } from '../ai/voice'
import { findRecall, planSession } from '../daily/plan'
import type { Quiz } from '../daily/quiz'
import { challengeView, NO_KEY, Round } from '../daily/round'
import type { Holder } from '../player'
import { videoKey, type LastVideo, type WatchedVideo, type WordEvent } from '../watchlog'
import type { SceneJudge } from './scenes'
import { CheckpointTriggers, type Offer } from './triggers'

// A checkpoint uses the lines met in this last stretch of the video.
const RECENT_MS = 5 * 60_000
// Whether there are such lines is checked this often, not on every tick.
const CONTENT_EVERY_MS = 5_000
// Checkpoints turn on by themselves once this many videos have been watched.
const AUTO_ON_VIDEOS = 3
const AUTO_ON_EVERY_MS = 60_000
// Duet's own holds: a pause made by one of these is not the learner's.
const DUET_HOLDS: Holder[] = ['wait', 'tutor', 'explain', 'checkpoint']
// Without a transcript, the dialogue is judged when it pauses this long, after this many new lines,
// from the last CONTEXT_LINES lines.
const GAP_MS = 5_000
const MIN_NEW_LINES = 3
const CONTEXT_LINES = 8

type Deps = {
  watcher: EventEmitter & { currentVideo?: WatchedVideo; script?: Script }
  player: { playing: boolean; isHeldBy(holder: Holder): boolean; hold(holder: Holder): void; release(holder: Holder): void }
  settings: { current: { checkpoints?: boolean; language: Language }; update(change: { checkpoints: boolean }): void }
  log: {
    videoLines(key: string, since: number): LastVideo | undefined
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
  private offer?: Offer
  private shownVideo?: string
  // Where scenes end in the video's transcript (line ids), and the transcript being split.
  private sceneEnds?: { key: string; ids: Set<number> }
  private splitting?: string
  // The line on screen, when the last one came, and when a scene last ended.
  private currentId?: number | null
  private lastLineAt?: number
  private sceneEndedAt?: number
  // Without a transcript: the last lines, how many came since the dialogue was last judged.
  private recent: { id: number; text: string }[] = []
  private newSinceJudged = 0
  private judging = false
  private content?: { key: string; at: number; ready: boolean }
  private autoCheckedAt?: number
  private round?: Round
  private video?: LastVideo

  constructor(private readonly deps: Deps) {
    const { watcher, player, log, cards, voice, quiz, overlay, random = Math.random } = deps
    watcher.on('script', (script: Script) => this.split(script))
    watcher.on('current', (id: number | null) => {
      const now = Date.now()
      const previous = this.currentId
      this.currentId = id
      if (id !== null) this.lastLineAt = now
      // The last line of a scene has gone by: a natural break.
      if (previous != null && previous !== id && this.transcriptScenes()?.has(previous)) this.sceneEndedAt = now
    })
    watcher.on('line', (line: OverlayLine) => {
      if (line.state !== 'ready' || this.transcriptScenes() || this.recent.some((item) => item.id === line.id)) return
      this.recent = [...this.recent, { id: line.id, text: line.original }].slice(-CONTEXT_LINES)
      this.newSinceJudged++
    })
    const handle = (channel: string, work: (...args: unknown[]) => unknown): void => {
      ipcMain.handle(`checkpoint:${channel}`, (event, ...args) => {
        if (!overlay.owns(event.sender)) throw new Error('Not allowed: checkpoints open from the strip.')
        return work(...args)
      })
    }
    const round = (): Round => {
      if (!this.round) throw new Error('No checkpoint is open.')
      return this.round
    }

    handle('open', (): CheckpointView => {
      const key = this.key()
      const video = key ? log.videoLines(key, Date.now() - RECENT_MS) : undefined
      if (!this.offer || !video?.lines.length) throw new Error('No checkpoint to open right now.')
      this.triggers.accept()
      this.setOffer(undefined)
      player.hold('checkpoint')
      this.video = video
      const deps = { cards, log, coach: voice?.coach, quiz }
      // A word the learner looked at, recalled; else, by turns, a line said back or what it meant.
      const recall = findRecall(video.lines, video.lines, new Set(video.words), random)
      if (recall) {
        this.round = new Round(deps, video, undefined, recall)
        return { ...challengeView(recall)!, video: video.title }
      }
      const plan = planSession({ due: 0, lines: video.lines, words: [], random })
      if (plan.say && random() < 0.5) {
        this.round = new Round(deps, video, plan.say, undefined)
        return { kind: 'say', original: plan.say.original, translation: plan.say.translation, video: video.title }
      }
      this.round = new Round(deps, video, undefined, plan.challenge)
      return { ...challengeView(plan.challenge)!, video: video.title }
    })
    handle('speak', async (): Promise<SessionAudio> => {
      const line = round().say
      if (!line || !this.video) throw new Error('This checkpoint has no line to say.')
      if (!voice) throw new Error(NO_KEY)
      return voice.tts.speak(line.original, this.video.language)
    })
    handle('coach', (clip) => round().coach(clip))
    handle('check-recall', (choice) => round().checkRecall(choice))
    handle('meaning-question', () => round().meaningQuestion())
    handle('meaning-check', (answer) => round().meaningCheck(answer))
    handle('done', () => {
      round()
      log.markCheckpointDone()
      this.close()
    })
    handle('close', () => this.close())
  }

  /** Call often (index.ts's main loop): offers a checkpoint when it's time, and turns them on after
   * the third video. */
  tick(now = Date.now()): void {
    const { player, settings } = this.deps
    this.autoOn(now)
    const key = this.key()
    // Another video: what was judged of the last one doesn't carry over.
    if (key !== this.shownVideo) {
      if (this.shownVideo !== undefined) {
        this.sceneEndedAt = undefined
        this.recent = []
        this.newSinceJudged = 0
      }
      this.shownVideo = key
    }
    if (settings.current.checkpoints === true) this.judgePause(now)
    const offer =
      settings.current.checkpoints === true
        ? this.triggers.tick({
            now,
            video: key,
            playing: player.playing,
            heldByDuet: DUET_HOLDS.some((holder) => player.isHeldBy(holder)),
            sceneEndedAt: this.sceneEndedAt,
            canOffer: !!key && this.hasContent(key, now),
            open: !!this.round
          })
        : undefined
    this.setOffer(offer)
  }

  private key(): string | undefined {
    const video = this.deps.watcher.currentVideo
    return video && videoKey(video)
  }

  /** Where scenes end in the transcript of the video on screen (line ids), once it's been split. */
  private transcriptScenes(): Set<number> | undefined {
    const key = this.key()
    return key && this.sceneEnds?.key === key ? this.sceneEnds.ids : undefined
  }

  /** Splits a video's transcript into scenes, once (one model call per video). */
  private split(script: Script): void {
    const { scenes, settings } = this.deps
    const key = this.key()
    if (!scenes || !key || script.source !== 'transcript' || !script.lines.length) return
    if (this.sceneEnds?.key === key || this.splitting === key) return
    this.splitting = key
    const lines = script.lines
    scenes
      .sceneEnds(
        lines.map((line) => line.original),
        settings.current.language
      )
      .then((ends) => {
        if (this.key() !== key) return
        this.sceneEnds = { key, ids: new Set(ends.flatMap((index) => (lines[index] ? [lines[index].id] : []))) }
        if (is.dev) console.log(`[duet] checkpoints: ${this.sceneEnds.ids.size} scene ends in ${key} (${lines.length} lines)`)
      })
      .catch((error) => console.error('[duet] checkpoints: could not find the scenes', error))
      .finally(() => {
        if (this.splitting === key) this.splitting = undefined
      })
  }

  /** Without a transcript: when the dialogue pauses after a few lines, asks whether that exchange
   * just ended. */
  private judgePause(now: number): void {
    const { scenes, settings } = this.deps
    if (!scenes || this.judging || this.transcriptScenes() || this.newSinceJudged < MIN_NEW_LINES) return
    if (this.lastLineAt === undefined || now - this.lastLineAt < GAP_MS) return
    const key = this.key()
    this.judging = true
    this.newSinceJudged = 0
    scenes
      .endsHere(
        this.recent.map((line) => line.text),
        settings.current.language
      )
      .then((ends) => {
        if (ends && this.key() === key) this.sceneEndedAt = Date.now()
      })
      .catch((error) => console.error('[duet] checkpoints: could not judge the scene', error))
      .finally(() => (this.judging = false))
  }

  /** Whether the last few minutes of this video have lines to make a checkpoint from. */
  private hasContent(key: string, now: number): boolean {
    if (this.content?.key !== key || now - this.content.at >= CONTENT_EVERY_MS)
      this.content = { key, at: now, ready: !!this.deps.log.videoLines(key, now - RECENT_MS)?.lines.length }
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
    this.video = undefined
    this.deps.player.release('checkpoint')
  }
}
