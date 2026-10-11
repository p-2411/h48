// Duet's main process: builds the pieces and connects them. Each piece lives in its own file:
//   captions.ts     the caption reader (which video, its captions, its position)
//   player.ts       the video's position and the one place that pauses and plays it
//   watcher.ts      captions or transcript → processed lines, one session per video and language
//   wait.ts         holds the video while the line on screen is still being translated
//   panel/          the side panel beside the video: Script and Explain tabs
//   explain/        Explain that: the explanation and its request
//   cards/          saved cards, My cards and FSRS review
//   tutor/          the voice tutor's window and work
//   sources/        each video site (YouTube, Netflix); store/ the local database
//   ipc/overlay.ts  the overlay's IPC; windows/ the windows; tray.ts the menu bar icon
//   ai/             the models (lines, voice), one file per provider
import { app, globalShortcut, type Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type { Moment } from '../shared/moment'
import { createModels, type Models } from './ai'
import { createVoiceModels, type DeliveryListener } from './ai/voice'
import { AudioSource } from './audio'
import { CaptionSource } from './captions'
import { Cards } from './cards'
import { Explain } from './explain'
import { hearLine } from './listen'
import { Panel } from './panel'
import { connectOverlay } from './ipc/overlay'
import { Player } from './player'
import { replay } from './replay'
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

// One Duet at a time: a second copy would read the same captions and write the same database.
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

app.whenReady().then(() => {
  if (!primary) return
  electronApp.setAppUserModelId('io.useduet.app')
  // An overlay app lives in the menu bar, not the Dock.
  if (process.platform === 'darwin') app.dock?.hide()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  let models: Models | undefined
  let modelError: string | undefined
  try {
    models = createModels()
  } catch (error) {
    modelError = error instanceof Error ? error.message : String(error)
  }

  let listener: DeliveryListener | undefined
  try {
    listener = createVoiceModels().listener
  } catch {
    // No voice provider: Explain works from the words alone.
  }

  const settings = new Settings()
  const captions = new CaptionSource()
  const audio = new AudioSource()
  const player = new Player((command) => captions.command(command))
  const watcher = new Watcher(captions, player, settings, models?.lines, modelError)
  const wait = new WaitForTranslation(player, settings, () => watcher.currentLine)
  const tutor = new Tutor(player)
  const replayMoment = (moment: Moment): void => replay(moment, { watcher, player })
  const panel = new Panel({ watcher, replay: replayMoment })
  const explain = new Explain(models?.explainer, replayMoment, panel, (moment, signal) =>
    hearLine(moment, { audio, player, listener }, signal)
  )
  // Listen to the browser only while a video is being watched in it.
  watcher.on('status', (status) => audio.listen(watcher.currentVideo ? status.bundle : undefined))
  const cards = new Cards({ replay: replayMoment, practise: (moment) => tutor.open(moment) })
  // Each opens on a line: the one on screen when no id is given.
  const openTutor = (lineId?: number): void => {
    const moment = watcher.moment(lineId)
    if (moment) tutor.open(moment)
  }
  const explainLine = (lineId?: number): void => {
    const moment = watcher.moment(lineId)
    if (!moment) return
    // "Pause while explaining": the video waits while the panel is open (see Player for who wins).
    if (settings.current.pauseForHelp) player.hold('explain')
    explain.open(moment)
  }
  panel.on('closed', () => player.release('explain'))
  settings.on('change', (_, changed) => {
    if (changed.pauseForHelp === false) player.release('explain')
  })

  const overlay = createOverlay()
  const showScript = (): void => panel.show('script')
  connectOverlay(overlay, { watcher, settings, openTutor, explainLine, showScript })
  tray = createTray({
    shortcut: SHORTCUT,
    toggleOverlay: () => toggleOverlay(overlay),
    showScript,
    explainLine: () => explainLine(),
    openTutor: () => openTutor(),
    openCards: () => cards.open(),
    settings
  })
  if (!globalShortcut.register(SHORTCUT, () => toggleOverlay(overlay)))
    console.error(`[duet] could not register ${SHORTCUT}; another app may be using it`)

  setInterval(() => {
    watcher.tick()
    wait.tick()
    player.sample()
  }, TICK_MS)
  captions.start()
  audio.start()

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    captions.stop()
    audio.stop()
    tray?.destroy()
  })
})

// The overlay can be hidden, but Duet keeps running in the tray until quit from there.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
