// A watching session: every finished caption line, in order, with its processed result. Each new
// line goes to the line model with the earlier lines as context. Lines are processed one at a time
// so each sees all the lines before it; if they arrive faster than they are processed, the oldest
// waiting ones are skipped so the overlay never falls behind the video.
import { EventEmitter } from 'events'
import type { Language, OverlayLine } from '../shared/types'
import { LineModelError, type HistoryEntry, type LineModel } from './ai'

// The context sent with each line is capped, and trimmed in large steps rather than one line at a
// time: every trim changes the start of the cached context, so it should happen rarely.
const CONTEXT_MAX = 400
const CONTEXT_KEEP = 250
// More waiting lines than this and the oldest are skipped.
const QUEUE_MAX = 2

export class LineSession extends EventEmitter {
  private lines: OverlayLine[] = []
  private history: HistoryEntry[] = []
  private context: HistoryEntry[] = []
  private queue: OverlayLine[] = []
  private busy = false
  private nextId = 1
  private abort?: AbortController

  constructor(
    private model: LineModel,
    private language: Language
  ) {
    super()
  }

  get modelName(): string {
    return this.model.name
  }

  /** A new language or a new video starts a fresh session: earlier lines no longer apply. */
  reset(language: Language = this.language): void {
    this.abort?.abort()
    this.language = language
    this.lines = []
    this.history = []
    this.context = []
    this.queue = []
  }

  add(original: string, at: number): void {
    const line: OverlayLine = { id: this.nextId++, original, at, state: 'pending' }
    this.lines.push(line)
    this.emit('line', line)
    this.queue.push(line)
    while (this.queue.length > QUEUE_MAX) {
      const skipped = this.queue.shift()!
      this.update(skipped, { state: 'failed', error: 'Skipped to keep up with the video.' })
    }
    void this.next()
  }

  private async next(): Promise<void> {
    if (this.busy) return
    const line = this.queue.shift()
    if (!line) return
    this.busy = true
    this.abort = new AbortController()
    const language = this.language
    try {
      const processed = await this.model.processLine(
        { language, line: line.original, history: this.context },
        this.abort.signal
      )
      // A reset while this line was in flight means it belongs to an old session.
      if (language === this.language && this.lines.includes(line)) {
        this.remember({ line: line.original, translation: processed.translation })
        this.update(line, { state: 'ready', processed })
      }
    } catch (error) {
      if (!this.abort.signal.aborted) {
        const message = error instanceof LineModelError ? error.message : 'Could not translate this line.'
        if (!(error instanceof LineModelError)) console.error('[duet] line failed', error)
        this.update(line, { state: 'failed', error: message })
        if (error instanceof LineModelError && error.kind === 'auth') this.emit('model-error', message)
      }
    } finally {
      this.busy = false
      void this.next()
    }
  }

  private remember(entry: HistoryEntry): void {
    this.history.push(entry)
    this.context.push(entry)
    if (this.context.length > CONTEXT_MAX) this.context = this.context.slice(-CONTEXT_KEEP)
  }

  private update(line: OverlayLine, change: Partial<OverlayLine>): void {
    Object.assign(line, change)
    this.emit('line', line)
  }
}
