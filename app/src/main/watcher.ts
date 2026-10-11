// Watching: the path from the video in the browser to processed lines.
//
// The caption reader says which video is open, what its captions say and where it is. The page's
// source (src/main/sources) says which video it is and whether the site offers a transcript; with
// one, the captions need not be on and lines are processed before they are spoken; without one,
// lines come from the captions on screen.
//
// One session per video and language is kept after switching away, so switching back (to a
// language or a video) shows what was already processed and carries on from there. Only the
// session on screen does any work. Kept in memory for this run, most recently used last.
//
// Events: "status" (OverlayStatus), "line" (OverlayLine), "current" (line id or null), "live"
// (caption text still being spoken), "script" (every line: Script) and "script-line" (one line of
// it added or changed).
import { EventEmitter } from 'events'
import { is } from '@electron-toolkit/utils'
import type { Moment } from '../shared/moment'
import type { OverlayLine, OverlayStatus, Script } from '../shared/types'
import type { LineModel } from './ai'
import type { CaptionSource, CaptionStatus } from './captions'
import type { PlayerTime } from './clock'
import type { Player } from './player'
import { LineSession } from './session'
import type { Settings } from './settings'
import { detectLanguage } from './detect'
import { sourceFor, type Source } from './sources'

// Videos and languages whose lines are kept after switching away.
const SESSIONS_KEPT = 12
// With no transcript and no captions on screen for this long, the video needs hearing.
const NO_CAPTIONS_MS = 6000
// How many recent caption lines decide the language of a line too short to tell.
const RECENT_VERDICTS = 4

/** The video open in the browser. */
type Video = { source: Source; id: string; url: string; title?: string }

export class Watcher extends EventEmitter {
  private _status: OverlayStatus = { trusted: false }
  private sessions = new Map<string, LineSession>()
  private session?: LineSession
  private video?: Video
  private fetching?: AbortController
  private captionSeenAt = 0
  private hearing = false
  // Whether recent caption lines were in the language being learnt, newest last.
  private verdicts: boolean[] = []

  constructor(
    captions: CaptionSource,
    private player: Player,
    private settings: Settings,
    private model: LineModel | undefined,
    modelError?: string
  ) {
    super()
    this._status = { trusted: false, model: model?.name, modelError }
    captions.on('status', (change: CaptionStatus) => {
      const source = sourceFor(change.url)
      this.setStatus({ ...change, error: change.error, site: source?.site, siteName: source?.name, controls: source?.controls })
      const id = change.url ? source?.videoId(change.url) : undefined
      if (source && id && change.url) {
        const title = change.title ? source.videoTitle(change.title) : undefined
        if (this.video?.id === id && this.video.source === source && title) this.video.title = title
        if (id !== this.video?.id || source !== this.video.source) {
          this.video = { source, id, url: change.url, title }
          player.reset()
          this.open()
        }
      } else if (this.video) {
        // Left the video (another page, or no video page found): nothing is being watched.
        this.video = undefined
        player.reset()
        this.open()
      }
    })
    // Captions in another language than the one being learnt (English captions on a Spanish video)
    // are ignored, and don't count as captions: the video may then be heard instead.
    captions.on('live', (line: { text: string }) => {
      if (line.text && !this.inLanguage(line.text, false)) return
      if (line.text) this.captionSeenAt = Date.now()
      if (!this.session?.hasTranscript) this.emit('live', line.text)
    })
    captions.on('line', (line: { text: string; at: number }) => {
      if (!this.inLanguage(line.text, true)) return
      // Where the video was when the caption appeared, so Replay can go back to it.
      const now = player.now()
      this.session?.add(line.text, line.at, now === undefined ? undefined : Math.max(0, now - (Date.now() - line.at) / 1000))
    })
    captions.on('time', (time: PlayerTime) => player.update(time))
    settings.on('change', (_, changed) => {
      if ('language' in changed && this.video) this.open()
    })
  }

  get status(): OverlayStatus {
    return this._status
  }

  /** The video open in the browser, if any. */
  get currentVideo(): { site: Source['site']; id: string } | undefined {
    return this.video && { site: this.video.source.site, id: this.video.id }
  }

  /** Whether a caption is in the language being learnt. A line too short to tell goes with the
   * recent lines; `remember` records the verdict (for finished lines, not text still growing). */
  private inLanguage(text: string, remember: boolean): boolean {
    const detected = detectLanguage(text)
    const recent = this.verdicts.filter(Boolean).length * 2 >= this.verdicts.length
    const matches = detected === undefined ? recent : detected === this.settings.current.language
    if (remember && detected !== undefined) {
      this.verdicts = [...this.verdicts, matches].slice(-RECENT_VERDICTS)
      if (this._status.captionsMatch !== matches) this.setStatus({ captionsMatch: matches })
    }
    return matches
  }

  /** A video is open with neither a transcript nor captions on screen: Duet should hear it. */
  get needsHearing(): boolean {
    return !!this.video && !!this.session && !this.session.hasTranscript && Date.now() - this.captionSeenAt > NO_CAPTIONS_MS
  }

  /** Duet started or stopped hearing the video for its lines. */
  setHearing(on: boolean): void {
    if (on === this.hearing) return
    this.hearing = on
    if (!this.session?.hasTranscript) this.setStatus({ source: on ? 'audio' : 'captions' })
  }

  /** A line heard in the audio (when there are no captions): `at` is when it began, `start` where
   * the video was then. */
  addHeardLine(text: string, at: number, start?: number): void {
    if (this.session && !this.session.hasTranscript) this.session.add(text, at, start)
  }

  /** Every line of the video being watched, for the Script tab. */
  get script(): Script {
    return this.session?.script ?? { source: 'captions', lines: [] }
  }

  /** The line on screen, if any. */
  get currentLine(): OverlayLine | undefined {
    return this.session?.currentLine
  }

  /** Moves the transcript's line on screen along with the video; call often. */
  tick(): void {
    this.session?.setTime(this.player.now())
  }

  /** A moment for a line (the one on screen by default), or undefined when there is no such line. */
  moment(lineId?: number): Moment | undefined {
    const taken = this.session?.moment(lineId)
    const video = this.video
    if (!taken || !video) return undefined
    return {
      language: this.settings.current.language,
      ...taken,
      video: { site: video.source.site, url: video.url, id: video.id, title: video.title, position: taken.line.start ?? this.player.now() },
      takenAt: Date.now()
    }
  }

  private setStatus(change: Partial<OverlayStatus>): void {
    this._status = { ...this._status, ...change }
    this.emit('status', this._status)
  }

  private sessionFor(key: string): LineSession | undefined {
    const kept = this.sessions.get(key)
    if (kept) {
      this.sessions.delete(key)
      this.sessions.set(key, kept)
      return kept
    }
    if (!this.model) return undefined
    const language = this.settings.current.language
    const created = new LineSession(this.model, language)
    created.on('line', (line: OverlayLine) => created === this.session && this.emit('line', line))
    created.on('current', (id: number | null) => created === this.session && this.emit('current', id))
    created.on('script', (script: Script) => created === this.session && this.emit('script', script))
    created.on('changed', (line: OverlayLine) => created === this.session && this.emit('script-line', line))
    if (is.dev)
      created.on('line', (line: OverlayLine) =>
        console.log(
          `[duet] ${language} line ${line.id} ${line.state}: ${line.original}${line.processed ? ` → ${line.processed.translation}` : ''}${line.error ? ` (${line.error})` : ''}`
        )
      )
    created.on('model-error', (message: string) => this.setStatus({ modelError: message }))
    this.sessions.set(key, created)
    if (this.sessions.size > SESSIONS_KEPT) this.sessions.delete(this.sessions.keys().next().value!)
    return created
  }

  /** Shows the session for the open video in the current language, fetching its transcript if needed. */
  private open(): void {
    this.fetching?.abort()
    // Give a new video (or language) time to show captions or find a transcript before hearing it,
    // and judge its captions afresh.
    this.captionSeenAt = Date.now()
    this.verdicts = []
    if (this._status.captionsMatch !== undefined) this.setStatus({ captionsMatch: undefined })
    this.session?.pause()
    const language = this.settings.current.language
    const video = this.video
    const target = video ? this.sessionFor(`${video.source.site}:${video.id}|${language}`) : undefined
    this.session = target
    this.emit('current', null)
    this.emit('script', this.script)
    if (!target || !video) return this.setStatus({ source: undefined })
    target.resume()
    this.setStatus({ source: target.hasTranscript ? 'transcript' : this.hearing ? 'audio' : 'captions' })
    const { id, source } = video
    if (!source.fetchTranscript || target.hasTranscript) return
    const abort = (this.fetching = new AbortController())
    source
      .fetchTranscript(id, language, abort.signal)
      .then((lines) => {
        if (abort.signal.aborted || !lines) return
        target.loadTranscript(lines)
        this.setStatus({ source: 'transcript' })
        if (is.dev) console.log(`[duet] transcript for ${id} (${language}): ${lines.length} lines`)
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          console.error(`[duet] no transcript for ${id}:`, error instanceof Error ? error.message : error)
      })
  }
}
