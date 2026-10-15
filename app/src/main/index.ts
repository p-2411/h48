// Duet's main process: builds the pieces and connects them. Each piece lives in its own file:
//   captions.ts     the caption reader (which video, its captions, its position, where it is on screen)
//   placement.ts    keeps the strip on the video, until the learner drags it
//   player.ts       the video's position and the one place that pauses and plays it
//   watcher.ts      captions or transcript → processed lines, one session per video and language
//   wait.ts         holds the video while the line on screen is still being translated
//   panel/          the side panel beside the video: Script and Explain tabs
//   explain/        Explain that: the side panel's Explain tab and its request
//   cards/          saved cards, My cards and FSRS review
//   tutor/          the conversation with Duet (text and voice), its thread and its card tools
//   talk/           Talk in the home base: a free conversation with Duet
//   home/           the home base window: Today, Watching, My cards, Settings
//   watchlog/       what was watched with Duet (videos, lines, words, days) and the streak
//   daily/          the daily session: the cards, a line said back, one challenge; the reminder
//   checkpoints/    a glow on the strip at a pause or a scene's end, one challenge when clicked
//   challenges/     the challenges the daily session and checkpoints share
//   sources/        each video site (YouTube, Netflix, Disney+, Crunchyroll); store/ the local database
//   ipc/overlay.ts  the overlay's IPC; windows/ the windows; tray.ts the menu bar icon
//   ai/             the models (lines, explain, voice), one file per provider
//   audio.ts, listen.ts, hearing.ts, spoken.ts   the video's sound: hearing lines, how they were said
//   detect.ts       which language a caption line is in; replay.ts going back to a line
//   settings.ts, shortcut.ts, welcome.ts, demo.ts   settings, the show/hide keys, first run, demos
//   reports/        crash and error reports (Sentry) and a few usage events (PostHog), never content
// First: where the data lives, before any other module can read it.
import './pin-data-folder'
import { followConsent, startReports } from './reports'
import { stopUsage, track, trackOnce } from './reports/usage'
import { app, globalShortcut, nativeTheme, Notification, type Tray } from 'electron'
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
import { Knowledge } from './knowledge'
import { connectKnowledge } from './knowledge/ipc'
import { Home, openDuet } from './home'
import { Talk } from './talk'
import { StripTalk } from './talk/strip'
import { DailySession } from './daily'
import { openAIQuiz } from './challenges/quiz'
import { Reminder } from './daily/reminder'
import { Checkpoints } from './checkpoints'
import { openAISceneJudge } from './checkpoints/scenes'
import { isFrom } from './windows/from'
import { createOverlay, toggleOverlay } from './windows/overlay'
import appIcon from '../../resources/icon.png?asset'

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
// Crash and error reports start before the app is ready, so they see everything after; only in the
// Duet that holds the lock, so a second copy on its way out never opens the database.
else startReports()

app.whenReady().then(() => {
  // Duet is dark only: the side panel's macOS material stays dark when the Mac is in light mode.
  nativeTheme.themeSource = 'dark'
  if (!primary) return
  electronApp.setAppUserModelId('io.useduet.app')
  // Run from source, the app is Electron's own binary: give its Dock icon Duet's (a built app has it
  // in its bundle, build/icon.icns).
  if (is.dev && process.platform === 'darwin') app.dock?.setIcon(appIcon)
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
  // Reports and usage events follow "Share crash reports and usage" in Settings from here on.
  followConsent(settings)
  track('app_opened')
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
    open: (cardId) => home.open('cards', cardId)
  })
  // The knowledge ladder: each word met and what the learner did with it (src/main/knowledge).
  const knowledge = new Knowledge()
  // Explain and the conversation about a line are one: the explanation first, then text or voice
  // with the tutor, which reads and saves cards in the same collection as My cards.
  const tutor = new Tutor(player, cards, knowledge)
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
    knowledge,
    shown: () => !overlay.isDestroyed() && overlay.isVisible()
  })
  app.on('before-quit', () => logLink.finish())
  // The first line ever shown on the strip: the moment Duet first works for someone.
  watcher.on('current', (id: number | null) => {
    if (id !== null && !overlay.isDestroyed() && overlay.isVisible())
      trackOnce('first_line_shown', {
        site: watcher.currentVideo?.site,
        language: settings.current.language
      })
  })
  // The home base: opened from the Dock, the menu bar, the strip's ⚙ and when Duet starts.
  const home = new Home({ log: watchLog, cards, settings, openWelcome: () => welcome.open(true) })
  // Talk in the home base: a free conversation with Duet, in the language being learnt.
  const talk = new Talk({ tutor, settings, window: home })
  // The text model's quiz (what did they mean?), for the daily session and checkpoints.
  const quiz = openAIQuiz()
  // The daily session in the home base's Today: reviews, a line said back, one challenge.
  new DailySession({
    log: watchLog,
    cards,
    voice,
    quiz,
    owns: (sender) => home.owns(sender),
    knowledge
  })
  // The strip's window, for the features that talk to its page.
  const strip = {
    owns: (sender: Electron.WebContents) => isFrom(overlay, sender),
    send: (channel: string, value: unknown) => overlay.isDestroyed() || overlay.webContents.send(channel, value)
  }
  // Checkpoints: a glow on the strip at a pause or where a scene ends; one challenge when clicked.
  const checkpoints = new Checkpoints({
    watcher,
    player,
    settings,
    log: watchLog,
    cards,
    voice,
    knowledge,
    quiz,
    scenes: openAISceneJudge(),
    overlay: strip
  })
  // Duet's pages ask how well each word is known (their colours, the word card), and hear when it
  // may have changed.
  connectKnowledge(knowledge, {
    owns: (sender) => strip.owns(sender) || panel.owns(sender) || home.owns(sender),
    send: (channel) => {
      strip.send(channel, null)
      panel.send(channel, null)
      home.send(channel, null)
    }
  })
  // A card reviewed, saved or deleted moves its word too (its FSRS memory counts).
  cards.on('changed', () => knowledge.emit('changed'))
  // The strip's page reloaded or crashed: a checkpoint it had open goes with it.
  overlay.webContents.on('did-start-loading', () => checkpoints.reset())
  overlay.webContents.on('render-process-gone', () => checkpoints.reset())
  // The daily reminder (off unless a time is set in Settings); clicking it opens Today. The last one
  // is kept, so it isn't garbage-collected (and its click lost) while it's on screen.
  let shownReminder: Notification | undefined
  const reminder = new Reminder({
    streak: () => watchLog.streak(),
    notify: (text) => {
      shownReminder = new Notification({ title: 'Duet', body: text })
      shownReminder.on('click', () => home.open('today'))
      shownReminder.show()
    }
  })
  reminder.set(settings.current.reminder)
  settings.on('change', (current, changed) => {
    if ('reminder' in changed) reminder.set(current.reminder)
  })
  // Talking to Duet from the strip: its mascot button, or the talk keys.
  new StripTalk({ watcher, settings, tutor, explain, talk, openTalk: () => home.open('talk'), window: strip })
  // Global keys, a setting each (Settings, in the home base): one shows or hides the overlay, the
  // other starts talking to Duet (showing the strip first, if it was hidden).
  const shortcuts = {
    show: new Shortcut(settings.current.shortcut, () => toggleOverlay(overlay)),
    talk: new Shortcut(settings.current.talkShortcut, () => {
      if (!overlay.isVisible()) overlay.showInactive()
      strip.send('duet:talk-keys', null)
    })
  }
  const showScript = (): void => panel.show('script')
  const { sendFit } = connectOverlay(overlay, {
    watcher,
    settings,
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
    setShortcut: (keys, kind) => {
      const other = kind === 'talk' ? settings.current.shortcut : settings.current.talkShortcut
      if (keys === other) return 'Duet already uses those keys for something else. Try a different combination.'
      const error = shortcuts[kind].change(keys)
      if (!error) settings.update(kind === 'talk' ? { talkShortcut: keys } : { shortcut: keys })
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
  const welcome = new Welcome(settings, audio)
  // First run: the welcome window, then the home base once it is done. After that, the home base,
  // at launch and from the Dock icon.
  const open = (): void => openDuet({ onboarded: settings.current.onboarded, home, welcome })
  open()
  app.on('activate', open)
  settings.on('change', (_, changed) => {
    if (changed.onboarded) {
      home.open()
      track('onboarding_done')
    }
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
    checkpoints.tick()
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
    void stopUsage()
  })
})

// The overlay can be hidden, but Duet keeps running in the tray until quit from there.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
