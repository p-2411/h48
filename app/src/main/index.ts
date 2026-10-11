// Duet's main process: the overlay, its global shortcut and tray menu, and the path a caption takes
// from the caption reader, through the line model, to the overlay.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { Language, Level, OverlaySettings, OverlayStatus } from '../shared/types'
import { createLineModel, type LineModel } from './ai'
import { CaptionSource, type CaptionStatus } from './captions'
import { PlayerClock, type PlayerTime } from './clock'
import { createOverlay, toggleOverlay } from './overlay'
import { LineSession } from './session'
import { fetchTranscript, youtubeVideoId } from './transcript'

// In development, settings such as ANTHROPIC_API_KEY can live in app/.env.local (git-ignored).
if (is.dev) {
  try {
    process.loadEnvFile(join(app.getAppPath(), '.env.local'))
  } catch {
    // No file: settings come from the environment.
  }
}

// Shows or hides the overlay from anywhere. Option/Alt+Shift+D on every OS.
const SHORTCUT = 'Alt+Shift+D'
// Videos and languages whose lines are kept after switching away.
const SESSIONS_KEPT = 12

const settings: OverlaySettings = { language: 'es', level: 2, guessFirst: true, waitForTranslation: true }
let status: OverlayStatus = { trusted: false }
let overlay: BrowserWindow | undefined
let tray: Tray | undefined

function send(channel: string, payload: unknown): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
}

function setStatus(change: Partial<OverlayStatus>): void {
  status = { ...status, ...change }
  send('duet:status', status)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.useduet.app')
  // An overlay app lives in the menu bar, not the Dock.
  if (process.platform === 'darwin') app.dock?.hide()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  overlay = createOverlay()

  let model: LineModel | undefined
  try {
    model = createLineModel()
    setStatus({ model: model.name })
  } catch (error) {
    setStatus({ modelError: error instanceof Error ? error.message : String(error) })
  }

  // One session per video and language, kept after switching away, so switching back (to a
  // language or a video) shows what was already processed and carries on from there. Only the
  // session on screen does any work. Kept in memory for this run, most recently used last.
  const sessions = new Map<string, LineSession>()
  let session: LineSession | undefined
  function sessionFor(key: string): LineSession | undefined {
    const kept = sessions.get(key)
    if (kept) {
      sessions.delete(key)
      sessions.set(key, kept)
      return kept
    }
    if (!model) return undefined
    const created = new LineSession(model, settings.language)
    created.on('line', (line) => created === session && send('duet:line', line))
    created.on('current', (id: number | null) => created === session && send('duet:current', id))
    if (is.dev)
      created.on('line', (line) =>
        console.log(`[duet] ${settings.language} line ${line.id} ${line.state}: ${line.original}${line.processed ? ` → ${line.processed.translation}` : ''}${line.error ? ` (${line.error})` : ''}`)
      )
    created.on('model-error', (message: string) => setStatus({ modelError: message }))
    sessions.set(key, created)
    if (sessions.size > SESSIONS_KEPT) sessions.delete(sessions.keys().next().value!)
    return created
  }

  // On YouTube the video's own transcript is fetched, so the captions need not be on and lines are
  // processed before they are spoken; without one (or on Netflix) lines come from the captions on
  // screen.
  const captions = new CaptionSource()
  const clock = new PlayerClock()
  let video: string | undefined
  let fetching: AbortController | undefined
  function open(url: string | undefined): void {
    fetching?.abort()
    session?.pause()
    const target = video ? sessionFor(`${video}|${settings.language}`) : undefined
    session = target
    send('duet:current', null)
    if (!target) return
    target.resume()
    setStatus({ source: target.hasTranscript ? 'transcript' : 'captions' })
    const id = youtubeVideoId(url)
    if (!id || target.hasTranscript) return
    const abort = (fetching = new AbortController())
    fetchTranscript(id, settings.language, abort.signal)
      .then((lines) => {
        if (abort.signal.aborted || !lines) return
        target.loadTranscript(lines)
        setStatus({ source: 'transcript' })
        if (is.dev) console.log(`[duet] transcript for ${id} (${settings.language}): ${lines.length} lines`)
      })
      .catch((error) => {
        if (!abort.signal.aborted) console.error(`[duet] no transcript for ${id}:`, error instanceof Error ? error.message : error)
      })
  }
  captions.on('status', (change: CaptionStatus) => {
    const key = youtubeVideoId(change.url) ?? change.url
    if (key && key !== video) {
      video = key
      clock.reset()
      open(change.url)
    }
    setStatus({ ...change, error: change.error })
  })
  captions.on('live', (line: { text: string }) => {
    if (!session?.hasTranscript) send('duet:live', line.text)
  })
  captions.on('line', (line: { text: string; at: number }) => session?.add(line.text, line.at))
  captions.on('time', (time: PlayerTime) => clock.update(time))

  // Waiting for translation: when the line on screen is still being translated, the video pauses
  // and plays again once it is ready. Pressing play while Duet waits plays through that line.
  let waitingFor: number | undefined
  let commandAt = 0
  let playedThrough: number | undefined
  function wait(): void {
    const line = session?.currentLine
    const pending = line?.state === 'pending' ? line : undefined
    if (waitingFor !== undefined) {
      // The reader takes a moment to report the pause; until then "playing" is old news.
      if (clock.playing && Date.now() - commandAt > 1000) {
        playedThrough = waitingFor
        waitingFor = undefined
      } else if (pending && settings.waitForTranslation) waitingFor = pending.id
      else {
        waitingFor = undefined
        captions.command('play')
      }
      return
    }
    if (settings.waitForTranslation && pending && pending.id !== playedThrough && clock.playing) {
      waitingFor = pending.id
      commandAt = Date.now()
      captions.command('pause')
    }
  }

  // Moves the transcript's line on screen along with the video.
  setInterval(() => {
    session?.setTime(clock.now())
    wait()
  }, 100)
  captions.start()

  ipcMain.handle('duet:get-state', () => ({ settings, status }))
  ipcMain.on('duet:set-language', (_, language: Language) => {
    if (language === settings.language) return
    settings.language = language
    send('duet:settings', settings)
    if (video) open(status.url)
  })
  ipcMain.on('duet:set-level', (_, level: Level) => {
    settings.level = level
    send('duet:settings', settings)
  })
  ipcMain.on('duet:set-guess-first', (_, on: boolean) => {
    settings.guessFirst = on
    send('duet:settings', settings)
  })
  ipcMain.on('duet:set-wait', (_, on: boolean) => {
    settings.waitForTranslation = on
    send('duet:settings', settings)
  })
  ipcMain.on('duet:hide', () => overlay?.hide())

  if (!globalShortcut.register(SHORTCUT, () => overlay && toggleOverlay(overlay)))
    console.error(`[duet] could not register ${SHORTCUT}; another app may be using it`)

  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 18, height: 18 }))
  tray.setToolTip('Duet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Show or hide (${SHORTCUT.replace('Alt', process.platform === 'darwin' ? 'Option' : 'Alt')})`, click: () => overlay && toggleOverlay(overlay) },
      { type: 'separator' },
      { label: 'Quit Duet', role: 'quit' }
    ])
  )

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    captions.stop()
  })
})

// The overlay can be hidden, but Duet keeps running in the tray until quit from there.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
