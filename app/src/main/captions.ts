// Captions: runs the caption reader for this OS and turns the raw text it sees into finished lines.
//
// Each OS has its own reader in resources/bin (native/macos for the Mac, native/windows for
// Windows), and both print the same JSON lines: status updates and caption text changes. The rest
// of the app only sees CaptionStatus and finished lines, so it never needs to know which OS it is on.
import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import { join } from 'path'
import { app, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { PlayerTime } from './clock'

export type CaptionStatus = {
  /** The reader is running and has the OS permission it needs. */
  trusted: boolean
  /** Which browser and page the reader is looking at, when it has found one. */
  browser?: string
  /** The browser's app id (macOS bundle id; on Windows its process id), for listening to its sound. */
  bundle?: string
  url?: string
  /** The browser window's title (on YouTube, the video's title and the site's name). */
  title?: string
  /** A caption area was found on that page. */
  captions?: boolean
  /** False when the player says this video has no captions at all. */
  available?: boolean
  /** Set when the reader could not start, for example on an OS without one yet. */
  error?: string
}

export type CaptionLine = { text: string; url?: string; at: number }

/** Where the video is on screen, in points from the top left of the main display. */
export type VideoFrame = { x: number; y: number; width: number; height: number }

export type PlayerCommand =
  { type: 'pause' } | { type: 'play' } | { type: 'seek'; seconds: number; from?: number; play?: boolean }

// A caption counts as finished when it has stopped changing for this long, or when the next
// caption is not just a longer version of it (YouTube's auto captions grow word by word).
const SETTLE_MS = 900

const READERS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'caption-reader-macos',
  win32: 'caption-reader-windows.exe'
}

export class CaptionSource extends EventEmitter {
  private child?: ChildProcess
  private pending?: CaptionLine
  private timer?: NodeJS.Timeout
  private lastSent = ''
  private buffer = ''

  start(): void {
    const name = READERS[process.platform]
    // In development, DUET_READER can name a stand-in reader (a script that plays a video's part),
    // to work on the overlay without driving a real browser (see dev/stand-in-reader.mjs).
    const standIn = is.dev ? process.env.DUET_READER : undefined
    const path =
      standIn ||
      (name && join(app.getAppPath(), 'resources', 'bin', name).replace('app.asar', 'app.asar.unpacked'))
    if (!path || !existsSync(path)) {
      this.emit('status', {
        trusted: false,
        error: `No caption reader for ${process.platform} yet.`
      } satisfies CaptionStatus)
      return
    }
    this.child = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    this.child.stdout?.setEncoding('utf8')
    this.child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk
      let newline: number
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const raw = this.buffer.slice(0, newline).trim()
        this.buffer = this.buffer.slice(newline + 1)
        if (raw) this.handle(raw)
      }
    })
    this.child.stderr?.on('data', (chunk) =>
      console.error('[caption reader]', String(chunk).trim())
    )
    this.child.on('exit', (code) => {
      this.emit('status', {
        trusted: false,
        error: `Caption reader stopped (code ${code}).`
      } satisfies CaptionStatus)
    })
  }

  /** Asks the reader to pause, play or seek the video, on sites whose controls allow it (see sources). */
  command(command: PlayerCommand): void {
    this.child?.stdin?.write(`${JSON.stringify(command)}\n`)
  }

  stop(): void {
    clearTimeout(this.timer)
    this.child?.kill()
    this.child = undefined
  }

  private handle(raw: string): void {
    let message: { type?: string; text?: string; url?: string; at?: number } & CaptionStatus &
      Partial<PlayerTime>
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (message.type === 'status') {
      const { trusted, browser, bundle, url, title, captions, available, error } = message
      this.emit('status', {
        trusted,
        browser,
        bundle,
        url,
        title,
        captions,
        available,
        error
      } satisfies CaptionStatus)
      return
    }
    if (message.type === 'frame') {
      const { x, y, width, height } = message as Partial<VideoFrame>
      const known = [x, y, width, height].every((side) => typeof side === 'number')
      const frame = known ? ({ x, y, width, height } as VideoFrame) : undefined
      // The Windows reader gives physical pixels; the app places windows in points (DIPs).
      this.emit('frame', frame && process.platform === 'win32' ? screen.screenToDipRect(null, frame) : frame)
      return
    }
    if (message.type === 'time') {
      const { t, playing, ad, at } = message
      if (typeof t === 'number')
        this.emit('time', {
          t,
          playing: !!playing,
          ad: !!ad,
          at: at ?? Date.now()
        } satisfies PlayerTime)
      return
    }
    if (message.type !== 'caption') return
    // The player's own notices aren't speech: YouTube's "Spanish (auto-generated) · Click ⚙ for
    // settings" appears in the caption area when captions come on, with the gear in every language.
    // Sound tags ([música de suspense], (risas)) aren't speech either; a line of only those is no line.
    const text = (message.text ?? '').includes('⚙')
      ? ''
      : (message.text ?? '')
          .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
          .replace(/(^|\s)-\s*(?=-|$)/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/^-\s*$/, '')
    const previous = this.pending?.text ?? ''
    // A caption that grows word by word keeps the time it first appeared.
    const growing = previous && text.startsWith(previous)
    const line: CaptionLine = {
      text,
      url: message.url,
      at: growing ? this.pending!.at : (message.at ?? Date.now())
    }
    // Show what is on screen straight away; the finished line follows once it settles.
    this.emit('live', line)
    if (previous && !text.startsWith(previous)) this.finish()
    clearTimeout(this.timer)
    this.pending = text ? line : undefined
    if (text) this.timer = setTimeout(() => this.finish(), SETTLE_MS)
  }

  private finish(): void {
    clearTimeout(this.timer)
    const line = this.pending
    this.pending = undefined
    if (!line || !line.text || line.text === this.lastSent) return
    this.lastSent = line.text
    this.emit('line', line)
  }
}
