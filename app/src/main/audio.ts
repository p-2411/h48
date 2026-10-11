// Audio: runs the audio reader for this OS, which keeps the last minute of the browser's sound in
// memory, and asks it for the audio of one line when the learner wants help with that line.
//
// The reader (native/macos/AudioReader) only listens while a video is being watched, and needs the
// System Audio Recording permission. Nothing is recorded to disk; a clip leaves the reader only
// when asked for here.
import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AudioClip } from './ai/voice'

export type AudioPermission = 'granted' | 'denied' | 'not-asked' | 'unknown' | 'unavailable'

const READERS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'audio-reader-macos' }
// How long a clip request may take before giving up.
const CLIP_TIMEOUT_MS = 3000

export class AudioSource {
  private child?: ChildProcess
  private buffer = ''
  private nextId = 1
  private waiting = new Map<number, (clip: AudioClip | undefined) => void>()
  private bundle?: string
  permission: AudioPermission = 'unavailable'

  start(): void {
    const name = READERS[process.platform]
    const path = name && join(app.getAppPath(), 'resources', 'bin', name).replace('app.asar', 'app.asar.unpacked')
    if (!path || !existsSync(path)) return
    this.permission = 'unknown'
    this.child = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] })
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
    this.child.stderr?.on('data', (chunk) => console.error('[audio reader]', String(chunk).trim()))
    this.child.on('exit', () => {
      this.child = undefined
      this.permission = 'unavailable'
      for (const done of this.waiting.values()) done(undefined)
      this.waiting.clear()
    })
  }

  stop(): void {
    this.child?.kill()
  }

  /** Listens to this browser (its macOS app id), or stops listening when undefined. */
  listen(bundle: string | undefined): void {
    if (bundle === this.bundle) return
    this.bundle = bundle
    this.send(bundle ? { type: 'listen', bundle } : { type: 'stop' })
  }

  /** Shows the permission prompt, the first time only. */
  requestPermission(): void {
    this.send({ type: 'request' })
  }

  /** The sound heard between two times (ms since 1970), or undefined when it isn't kept. */
  clip(from: number, to: number): Promise<AudioClip | undefined> {
    if (!this.child || this.permission !== 'granted') return Promise.resolve(undefined)
    const id = this.nextId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.waiting.delete(id) && resolve(undefined), CLIP_TIMEOUT_MS)
      this.waiting.set(id, (clip) => {
        clearTimeout(timer)
        resolve(clip)
      })
      this.send({ type: 'clip', id, from, to })
    })
  }

  private send(message: object): void {
    this.child?.stdin?.write(`${JSON.stringify(message)}\n`)
  }

  private handle(raw: string): void {
    let message: { type?: string; permission?: AudioPermission; id?: number; wav?: string; level?: number }
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (message.type === 'status' && message.permission) this.permission = message.permission
    if (message.type === 'clip' && message.id !== undefined) {
      const done = this.waiting.get(message.id)
      this.waiting.delete(message.id)
      // Silence means nothing to hear (or no permission: macOS then gives silence, not an error).
      const audible = message.wav && (message.level ?? 0) > 0.002
      done?.(audible ? { data: new Uint8Array(Buffer.from(message.wav!, 'base64')), mimeType: 'audio/wav' } : undefined)
    }
  }
}
