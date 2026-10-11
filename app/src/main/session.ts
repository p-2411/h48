// A watching session: the lines of one video, in order, with their processed results. Lines go to
// the line model in chunks, one chunk at a time, with the earlier lines as context.
//
// Lines arrive one of two ways:
// - From a transcript, all at once with timings. The line on screen follows the video's position,
//   and the lines after it are processed ahead in chunks that grow as the lead grows: 3 lines
//   first (quick, and enough for each to make sense of the others), then 6, then 12 at a time. Once ahead, every
//   line is ready before it is spoken. A seek starts again from the new position.
// - From the captions on screen, one by one as they finish. Lines that wait are sent together; if
//   too many wait, the oldest are skipped so the overlay never falls behind the video.
import { EventEmitter } from 'events'
import type { MomentLine } from '../shared/moment'
import type { Language, OverlayLine } from '../shared/types'
import { ModelError, type HistoryEntry, type LineModel } from './ai'
import type { TranscriptLine } from './transcript'

// The context is the last CONTEXT_KEEP processed lines before the line, with its start moved in
// steps of CONTEXT_STEP: every move changes the start of the cached context, so it should be rare.
const CONTEXT_KEEP = 250
const CONTEXT_STEP = 150
// From captions: more waiting lines than this and the oldest are skipped.
const QUEUE_MAX = 2
// From a transcript: how many lines past the one on screen are processed ahead, and the most lines
// in one chunk.
const AHEAD = 40
const CHUNK_MAX = 12
// The first chunk after opening or seeking: 3 lines take ~3 s against ~2 s for one, but a line
// translated alone often picks the wrong sense of a word (measured: "hoja" came back as "leaf"
// instead of "blade" alone or in twos, "blade" every time in threes).
const FIRST_CHUNK = 3

// The context frozen with a moment (the spec's starting budget).
const MOMENT_SECONDS = 20
const MOMENT_CHARS = 1500

// Line ids are unique across sessions, so the overlay never mixes up lines from two of them.
let nextId = 1

export class LineSession extends EventEmitter {
  private lines: OverlayLine[] = []
  private transcript = false
  /** Index of the line on screen, or of the next one when the video is between lines. */
  private position = 0
  private current?: OverlayLine
  private busy = false
  private inFlight: OverlayLine[] = []
  private abort?: AbortController
  private paused = false

  constructor(
    private model: LineModel,
    private readonly language: Language
  ) {
    super()
  }

  get modelName(): string {
    return this.model.name
  }

  /** The line on screen, if any. */
  get currentLine(): OverlayLine | undefined {
    return this.current
  }

  /** A copy of a line (the one on screen by default) and the lines just before it, for a moment. */
  moment(id?: number): { line: OverlayLine; earlier: MomentLine[] } | undefined {
    const line = id === undefined ? this.current : this.lines.find((item) => item.id === id)
    if (!line) return undefined
    const when = (item: OverlayLine): number => item.start ?? item.at / 1000
    const earlier: MomentLine[] = []
    let chars = 0
    for (const item of this.lines.slice(0, this.lines.indexOf(line)).reverse()) {
      chars += item.original.length
      if (when(line) - when(item) > MOMENT_SECONDS || chars > MOMENT_CHARS) break
      earlier.unshift({ original: item.original, translation: item.processed?.translation })
    }
    return { line: structuredClone(line), earlier }
  }

  get hasTranscript(): boolean {
    return this.transcript
  }

  /** Clears every line: the session starts again. */
  reset(): void {
    this.cancel()
    this.lines = []
    this.transcript = false
    this.position = 0
    this.show(undefined)
  }

  /** Replaces the session with a video's whole transcript; lines then follow setTime. */
  loadTranscript(transcript: TranscriptLine[]): void {
    this.reset()
    this.transcript = true
    this.lines = transcript.map((item) => ({
      id: nextId++,
      original: item.text,
      at: Date.now(),
      start: item.start,
      end: item.end,
      state: 'pending'
    }))
    void this.next()
  }

  /** The video's position in seconds, or undefined when unknown (for example during an ad). */
  setTime(seconds: number | undefined): void {
    if (!this.transcript) return
    if (seconds === undefined) return this.show(undefined)
    // The last line that has started. It stays up until the next one starts, so there is time to read it.
    let index = -1
    while (index + 1 < this.lines.length && this.lines[index + 1].start! <= seconds) index++
    const position = Math.max(index, 0)
    if (position !== this.position) {
      this.position = position
      // After a seek to lines not yet done, the chunk in flight is elsewhere: drop it and start here.
      const here = this.lines[position]
      if (this.busy && here.state === 'pending' && !this.inFlight.includes(here)) this.cancel()
      void this.next()
    }
    this.show(index >= 0 ? this.lines[index] : undefined)
  }

  /** A finished caption line read from the screen. */
  add(original: string, at: number): void {
    if (this.transcript) return
    const line: OverlayLine = { id: nextId++, original, at, state: 'pending' }
    this.lines.push(line)
    this.show(line)
    const waiting = this.lines.filter((item) => item.state === 'pending' && !this.inFlight.includes(item))
    for (const skipped of waiting.slice(0, -QUEUE_MAX))
      this.update(skipped, { state: 'failed', error: 'Skipped to keep up with the video.' })
    void this.next()
  }

  /** Stops work while another session is on screen; processed lines are kept. */
  pause(): void {
    this.paused = true
    this.cancel()
  }

  /** Back on screen: shows the current line again and carries on where it stopped. */
  resume(): void {
    this.paused = false
    if (this.current) this.emit('line', this.current)
    this.emit('current', this.current?.id ?? null)
    void this.next()
  }

  /** Stops the chunk in flight; its lines stay pending. */
  private cancel(): void {
    this.abort?.abort()
    this.busy = false
    this.inFlight = []
  }

  /** The next chunk to process, in order. */
  private pick(): OverlayLine[] {
    if (!this.transcript) return this.lines.filter((line) => line.state === 'pending')
    const window = this.lines.slice(this.position, this.position + AHEAD + 1)
    const first = window.findIndex((line) => line.state === 'pending')
    if (first < 0) return []
    // `first` lines from the one on screen are already done: the lead. The chunk is twice the lead,
    // so it finishes before the lead runs out.
    const size = Math.min(Math.max(first * 2, FIRST_CHUNK), CHUNK_MAX)
    const chunk: OverlayLine[] = []
    for (const line of window.slice(first)) {
      if (line.state !== 'pending' || chunk.length === size) break
      chunk.push(line)
    }
    return chunk
  }

  private contextFor(line: OverlayLine): HistoryEntry[] {
    const earlier = this.lines
      .slice(0, this.lines.indexOf(line))
      .filter((item) => item.state === 'ready')
      .map((item) => ({ line: item.original, translation: item.processed!.translation }))
    const start = Math.floor(Math.max(0, earlier.length - CONTEXT_KEEP) / CONTEXT_STEP) * CONTEXT_STEP
    return earlier.slice(start)
  }

  private async next(): Promise<void> {
    if (this.busy || this.paused) return
    const chunk = this.pick()
    if (!chunk.length) return
    this.busy = true
    this.inFlight = chunk
    const abort = (this.abort = new AbortController())
    const language = this.language
    try {
      const processed = await this.model.processLines(
        { language, lines: chunk.map((line) => line.original), history: this.contextFor(chunk[0]) },
        abort.signal
      )
      // A reset while this chunk was in flight means it belongs to an old session.
      if (!abort.signal.aborted) chunk.forEach((line, index) => this.update(line, { state: 'ready', processed: processed[index] }))
    } catch (error) {
      if (!abort.signal.aborted) {
        const message = error instanceof ModelError ? error.message : 'Could not translate this line.'
        if (!(error instanceof ModelError)) console.error('[duet] lines failed', error)
        for (const line of chunk) this.update(line, { state: 'failed', error: message })
        if (error instanceof ModelError && error.kind === 'auth') this.emit('model-error', message)
      }
    } finally {
      if (!abort.signal.aborted) {
        this.busy = false
        this.inFlight = []
        void this.next()
      }
    }
  }

  private show(line: OverlayLine | undefined): void {
    if (line === this.current) return
    this.current = line
    if (line) this.emit('line', line)
    this.emit('current', line?.id ?? null)
  }

  private update(line: OverlayLine, change: Partial<OverlayLine>): void {
    Object.assign(line, change)
    // From a transcript, the overlay only needs the line on screen; the others are sent as they appear.
    if (!this.transcript || line === this.current) this.emit('line', line)
  }
}
