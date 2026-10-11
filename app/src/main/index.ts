// Duet's main process: builds the pieces and connects them. Each piece lives in its own file:
//   captions.ts     the caption reader (which video, its captions, its position, where it is on screen)
//   placement.ts    keeps the strip on the video, until the learner drags it
//   player.ts       the video's position and the one place that pauses and plays it
//   watcher.ts      captions or transcript → processed lines, one session per video and language
//   wait.ts         holds the video while the line on screen is still being translated
//   panel/          the side panel beside the video: Script, Explain and Review tabs
//   explain/        Explain that: the side panel's Explain tab and its request
//   cards/          saved cards, My cards and FSRS review
//   tutor/          the conversation about a line (text and voice) and its card tools
//   sources/        each video site (YouTube, Netflix); store/ the local database
//   ipc/overlay.ts  the overlay's IPC; windows/ the windows; tray.ts the menu bar icon
//   ai/             the models (lines, explain, voice), one file per provider
//   audio.ts, listen.ts, hearing.ts, spoken.ts   the video's sound: hearing lines, how they were said
//   detect.ts       which language a caption line is in; replay.ts going back to a line
//   settings.ts, shortcut.ts, welcome.ts, demo.ts   settings, the show/hide keys, first run, demos
import { app, globalShortcut, nativeTheme, type Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type { Moment } from '../shared/moment'
import { createModels, type Models } from './ai'
import { createVoiceModels, type VoiceModels } from './ai/voice'
import { demoEnabled, demoMoment } from './demo'
import { AudioSource } from './audio'
import { CaptionSource, type CaptionStatus, type VideoFrame } from './captions'
import { Cards } from './cards'
import { draftFromMoment } from './cards/drafts'
import { Explain } from './explain'
import { Hearing } from './hearing'
import { hearLine } from './listen'
import { SpokenLanguageCheck } from './spoken'
import { Panel } from './panel'
import { connectOverlay } from './ipc/overlay'
import { Placement } from './placement'
import { Player } from './player'
import { replay } from './replay'
import { Settings } from './settings'
import { createTray } from './tray'
import { Tutor } from './tutor'
import { Welcome } from './welcome'
import { Shortcut } from './shortcut'
import { WaitForTranslation } from './wait'
import { Watcher } from './watcher'
import { WatchLog } from './watchlog'
import { connectWatchLog } from './watchlog/connect'
import { Home } from './home'
import { createOverlay, toggleOverlay } from './windows/overlay'

// In development, settings such as OPENAI_API_KEY can live in app/.env.local (git-ignored).
if (is.dev) {
  try {
    process.loadEnvFile(join(app.getAppPath(), '.env.local'))
  } catch {
    // No file: settings come from the environment.
  }
}

// How often the line on screen follows the video, and how often hearing looks at the audio.
const TICK_MS = 100
const HEARING_TICK_MS = 500

let tray: Tray | undefined

// One Duet at a time: a second copy would read the same captions and write the same database.
const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

app.whenReady().then(() => {
  // Duet is dark only: the side panel's macOS material stays dark when the Mac is in light mode.
  nativeTheme.themeSource = 'dark'
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

  let voice: VoiceModels | undefined
  try {
    voice = createVoiceModels()
  } catch {
    // No voice provider: Explain works from the words alone, and videos without captions go unheard.
  }

  const settings = new Settings()
  const captions = new CaptionSource()
  const audio = new AudioSource()
  const player = new Player((command) => captions.command(command))
  const watcher = new Watcher(captions, player, settings, models?.lines, modelError)
  const wait = new WaitForTranslation(
    player,
    settings,
    () => watcher.currentLine,
    () => watcher.followingTranscript
  )
  const replayMoment = (moment: Moment): void => replay(moment, { watcher, player })
  const panel = new Panel({ watcher, settings, replay: replayMoment })
  // How a line was said, from the audio; Explain and the spoken-language check both ask.
  const hear = (moment: Moment, signal: AbortSignal): ReturnType<typeof hearLine> =>
    hearLine(moment, { audio, player, listener: voice?.listener }, signal)
  const demo = demoEnabled()
  // Listen to the browser only while a video is being watched in it.
  watcher.on('status', (status) => audio.listen(watcher.currentVideo ? status.bundle : undefined))
  // Practising a card opens Explain, and its conversation, on the card's moment. My cards and Review
  // are places in the home base.
  const cards = new Cards({
    replay: replayMoment,
    practise: (moment) => explain.open(moment),
    open: (cardId) => home.open('cards', cardId),
    openReview: () => home.open('review')
  })
  // Explain and the conversation about a line are one: the explanation first, then text or voice
  // with the tutor, which reads and saves cards in the same collection as My cards.
  const tutor = new Tutor(player, cards, panel)
  const explain = new Explain({
    explainer: models?.explainer,
    replay: replayMoment,
    panel,
    tutor,
    hear
  })
  if (demo) cards.seedDemoFixtures(demoMoment())
  // Opens Explain on a line: the one on screen when no id is given (in demo mode, the demo line).
  const explainLine = (lineId?: number): void => {
    const moment = watcher.moment(lineId) ?? (demo ? demoMoment() : undefined)
    if (!moment) return
    // "Pause while explaining": the video waits while the panel is open (see Player for who wins).
    if (settings.current.pauseForHelp) player.hold('explain')
    explain.open(moment)
    logLink.explained(moment)
  }
  panel.on('closed', () => player.release('explain'))
  settings.on('change', (_, changed) => {
    if (changed.pauseForHelp === false) player.release('explain')
  })

  const overlay = createOverlay(settings)
  // The watch log: videos, lines met, words and study days, for the daily session, checkpoints and
  // the streak (src/main/watchlog). Watching counts only while the strip is shown.
  const watchLog = new WatchLog()
  const logLink = connectWatchLog(watchLog, {
    watcher,
    player,
    settings,
    cards,
    shown: () => !overlay.isDestroyed() && overlay.isVisible()
  })
  app.on('before-quit', () => logLink.finish())
  // The home base: opened from the Dock, the menu bar, the strip's ⚙ and when Duet starts.
  const home = new Home({ log: watchLog, cards, openWelcome: () => welcome.open(true) })
  app.on('activate', () => home.open())
  // Shows or hides the overlay from anywhere; the keys are a setting (⚙ on the strip).
  const shortcut = new Shortcut(settings.current.shortcut, () => toggleOverlay(overlay))
  const showScript = (): void => panel.show('script')
  const { sendDue, sendFit } = connectOverlay(overlay, {
    watcher,
    settings,
    due: () => cards.counts(),
    explainLine,
    showScript,
    // A star on the strip: the whole line, or one of its words.
    saveLine: (lineId, pair) => {
      const moment = watcher.moment(lineId)
      const draft = moment && draftFromMoment(moment, pair)
      return draft ? cards.saveDraft(draft) : undefined
    },
    unsave: (cardId) => cards.remove(cardId),
    hoveredWord: (lineId, text) => logLink.hovered(lineId, text),
    openSettings: () => home.open('settings'),
    replayLine: (lineId) => {
      const moment = watcher.moment(lineId)
      if (moment) replayMoment(moment)
    },
    setShortcut: (keys) => {
      const error = shortcut.change(keys)
      if (!error) settings.update({ shortcut: keys })
      return error
    },
    // Pressing play for the learner counts as their own play, so Wait lets this line go.
    playOn: () => captions.command({ type: 'play' }),
    drag: (phase) => placement.drag(phase),
    fit: () => placement.maxWidth()
  })
  // The strip sits on the video, following it, until the learner drags it (see placement.ts).
  const placement = new Placement(overlay, settings, sendFit)
  captions.on('frame', (frame?: VideoFrame) => placement.setFrame(frame))
  captions.on('status', (status: CaptionStatus) => placement.setVideo(status.url))
  cards.on('changed', sendDue)
  // Due counts change with the clock too (a card comes due), so refresh them now and then.
  setInterval(() => sendDue(cards.counts()), 60_000)
  const welcome = new Welcome(settings, audio)
  // First run: the welcome window, then the home base once it is done. After that, the home base.
  if (settings.current.onboarded) home.open()
  else welcome.open()
  settings.on('change', (_, changed) => {
    if (changed.onboarded) home.open()
  })
  tray = createTray({
    openHome: () => home.open(),
    toggleOverlay: () => toggleOverlay(overlay),
    showScript,
    explainLine: () => explainLine(),
    openCards: () => home.open('cards'),
    openWelcome: () => welcome.open(true)
  })
  // In demo mode Explain opens at once on the demo line, so the flow shows without a video.
  if (demo) setTimeout(() => explainLine(), 300)

  // Videos with neither a transcript nor captions: lines from the audio.
  const hearing = new Hearing({ watcher, player, audio, speech: voice?.speechToText, settings })

  setInterval(() => {
    watcher.tick()
    wait.tick()
    player.sample()
    logLink.tick()
    watcher.setPlayback({
      playing: player.playing,
      waiting: player.isHeldBy('wait'),
      audio: audio.permission
    })
  }, TICK_MS)
  setInterval(() => hearing.tick(), HEARING_TICK_MS)
  // Once per video: is it spoken in the language being learnt, or are its subtitles a translation?
  const spoken = new SpokenLanguageCheck({
    watcher,
    player,
    audio,
    settings,
    hear
  })
  setInterval(() => spoken.tick(), 1000)
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
