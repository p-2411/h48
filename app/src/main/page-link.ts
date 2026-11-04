// The link to Duet's companion browser extension (extension/ in this repo). The extension runs in
// the video page, so it reads the <video> element itself: the exact time, play state and playback
// rate, sent on every play, pause, seek and speed change and a few times a second besides. The
// caption reader (captions.ts) only sees the seek bar, which YouTube stops updating while its
// controls are hidden; while the extension reports the open video, its time is used instead, and
// pause, play and seek go to the page through it.
//
// A WebSocket server on 127.0.0.1 only. Only browser extensions may connect: a web page's
// connection carries its own origin, which is refused.
//
// Events: "time" (PlayerTime with the page's url), "connected" / "disconnected" (connection count).
import { EventEmitter } from 'events'
import { createServer, type Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { PlayerCommand } from './captions'
import type { PlayerTime } from './clock'

/** The port the extension connects to (extension/background.js has the same number). */
export const PAGE_LINK_PORT = 47821

const EXTENSION_ORIGINS = ['chrome-extension://', 'moz-extension://', 'extension://']

export type PageTime = PlayerTime & { url: string }

type Message = { type?: string; url?: unknown; t?: unknown; playing?: unknown; rate?: unknown; ad?: unknown; at?: unknown }

export class PageLink extends EventEmitter {
  private server?: Server
  private sockets = new Map<WebSocket, { url?: string }>()

  /** `port` is the extension's; another only in tests (Duet itself may be running). */
  constructor(private readonly port = PAGE_LINK_PORT) {
    super()
  }

  start(): void {
    const server = createServer((_, response) => response.writeHead(426).end())
    const wss = new WebSocketServer({
      server,
      maxPayload: 64 * 1024,
      verifyClient: ({ origin }) => EXTENSION_ORIGINS.some((prefix) => origin?.startsWith(prefix))
    })
    wss.on('connection', (socket) => {
      this.sockets.set(socket, {})
      this.emit('connected', this.sockets.size)
      socket.on('message', (data) => this.handle(socket, String(data)))
      socket.on('close', () => {
        this.sockets.delete(socket)
        this.emit('disconnected', this.sockets.size)
      })
      socket.on('error', () => socket.terminate())
    })
    server.on('error', (error: NodeJS.ErrnoException) =>
      // Another copy of Duet has the port: this one goes on with the caption reader's time.
      console.error(`[duet] page link not started: ${error.code ?? error.message}`)
    )
    server.listen(this.port, '127.0.0.1')
    this.server = server
  }

  /** Sends a pause, play or seek to the page showing `matches` (by its url); false if none is linked. */
  command(matches: (url: string) => boolean, command: PlayerCommand): boolean {
    for (const [socket, { url }] of this.sockets) {
      if (url && matches(url) && socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(command))
        return true
      }
    }
    return false
  }

  stop(): void {
    for (const socket of this.sockets.keys()) socket.terminate()
    this.sockets.clear()
    this.server?.close()
    this.server = undefined
  }

  private handle(socket: WebSocket, raw: string): void {
    let message: Message
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (message.type !== 'time' || typeof message.url !== 'string' || typeof message.t !== 'number') return
    if (!Number.isFinite(message.t) || message.t < 0) return
    this.sockets.set(socket, { url: message.url })
    const rate = typeof message.rate === 'number' && message.rate > 0 && message.rate <= 16 ? message.rate : 1
    // Same machine, same clock: the page's own timestamp is when the time was read.
    const at = typeof message.at === 'number' && Math.abs(message.at - Date.now()) < 5000 ? message.at : Date.now()
    this.emit('time', {
      url: message.url,
      t: message.t,
      playing: message.playing === true,
      ad: message.ad === true,
      rate,
      at,
      exact: true
    } satisfies PageTime)
  }
}
