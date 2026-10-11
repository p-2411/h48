// Duet's main process: builds the pieces and connects them. Each piece lives in its own file:
//   captions.ts     the caption reader (which video, its captions, its position)
//   player.ts       the video's position and the one place that pauses and plays it
//   watcher.ts      captions or transcript → processed lines, one session per video and language
//   wait.ts         holds the video while the line on screen is still being translated
//   tutor/          the voice tutor's window and work
//   ipc/overlay.ts  the overlay's IPC; windows/ the windows; tray.ts the menu bar icon
//   ai/             the models (lines, voice), one file per provider
import { app, globalShortcut, type Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { createLineModel, type LineModel } from './ai'
import { CaptionSource } from './captions'
import { connectOverlay } from './ipc/overlay'
import { Player } from './player'
import { Settings } from './settings'
import { createTray } from './tray'
import { Tutor } from './tutor'
import { WaitForTranslation } from './wait'
import { Watcher } from './watcher'
import { createOverlay, toggleOverlay } from './windows/overlay'

// In development, settings such as OPENAI_API_KEY can live in app/.env.local (git-ignored).
if (is.dev) {
  try {
    process.loadEnvFile(join(app.getAppPath(), '.env.local'))
  } catch {
    // No file: settings come from the environment.
  }
}

// Shows or hides the overlay from anywhere. Option/Alt+Shift+D on every OS.
const SHORTCUT = 'Alt+Shift+D'
// How often the line on screen follows the video.
const TICK_MS = 100

let tray: Tray | undefined

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.useduet.app')
  // An overlay app lives in the menu bar, not the Dock.
  if (process.platform === 'darwin') app.dock?.hide()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  let model: LineModel | undefined
  let modelError: string | undefined
  try {
    model = createLineModel()
  } catch (error) {
    modelError = error instanceof Error ? error.message : String(error)
  }

  const settings = new Settings()
  const captions = new CaptionSource()
  const player = new Player((type) => captions.command(type))
  const watcher = new Watcher(captions, player, settings, model, modelError)
  const wait = new WaitForTranslation(player, settings, () => watcher.currentLine)
  const tutor = new Tutor(player)
  const openTutor = (lineId?: number): void => {
    const moment = watcher.moment(lineId)
    if (moment) tutor.open(moment)
  }

  const overlay = createOverlay()
  connectOverlay(overlay, { watcher, settings, openTutor })
  tray = createTray({ shortcut: SHORTCUT, toggleOverlay: () => toggleOverlay(overlay), openTutor: () => openTutor() })
  if (!globalShortcut.register(SHORTCUT, () => toggleOverlay(overlay)))
    console.error(`[duet] could not register ${SHORTCUT}; another app may be using it`)

  setInterval(() => {
    watcher.tick()
    wait.tick()
  }, TICK_MS)
  captions.start()

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    captions.stop()
    tray?.destroy()
  })
})

// The overlay can be hidden, but Duet keeps running in the tray until quit from there.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
