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
//   updates/        Duet's own updates: found and downloaded quietly, installed on quit
//   ai/             the models (lines, explain, voice), one file per provider
//   audio.ts, listen.ts, hearing.ts, spoken.ts   the video's sound: hearing lines, how they were said
//   detect.ts       which language a caption line is in; replay.ts going back to a line
//   settings.ts, shortcut.ts, welcome.ts, demo.ts   settings, the show/hide keys, first run, demos
//   reports/        crash and error reports (Sentry) and a few usage events (PostHog), never content
//   account/        sign-in (WorkOS) and Duet's server, which holds the OpenAI key and meters each
//                   learner: credits, watch hours, live voice minutes, the plan
// First: where the data lives, before any other module can read it.
import './pin-data-folder'
import { followConsent, startReports } from './reports'
import { stopUsage, track, trackOnce } from './reports/usage'
import { app, BrowserWindow, globalShortcut, Menu, nativeTheme, Notification, type Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type { Moment } from '../shared/moment'
import { setupAccount } from './account/setup'
import { connectAccount } from './account/connect'
import { LiveMeter } from './account/live'
import { ServerWatch } from './account/watch'
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
import { Updates } from './updates'
import { connectUpdates } from './updates/ipc'
import { Welcome } from './welcome'
import { Shortcut } from './shortcut'
import { WaitForTranslation } from './wait'
import { Watcher } from './watcher'
import { WatchLog } from './watchlog'
import { connectWatchLog } from './watchlog/connect'
import { Knowledge } from './knowledge'
import { connectKnowledge } from './knowledge/ipc'
import { Progress } from './progress'
import { connectProgress } from './progress/ipc'
import { Home, openDuet } from './home'
import { Talk } from './talk'
import { StripTalk } from './talk/strip'
import { DailySession } from './daily'
import { openAIQuiz } from './challenges/quiz'
import { Flashcards } from './flashcards'
import { Dictionary } from './dictionary'
import { packFolder, Packs } from './dictionary/packs'
import { Reminder } from './daily/reminder'
import { Checkpoints } from './checkpoints'
import { openAISceneJudge } from './checkpoints/scenes'
import { isFrom } from './windows/from'
import { createOverlay, stripFollowsVideo } from './windows/overlay'
import { connectFeedback } from './feedback'
import { installAppIcons } from './icons'

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
// Progress catches up with the lines kept from before it this long after launch (once).
const CATCH_UP_AFTER_MS = 3_000
// Whether a word the offline dictionary pack lacks is looked up by the AI (it costs credits). Set
// DUET_AI_ENTRIES=off to see what the packs alone give.
const AI_ENTRY_FALLBACK = process.env.DUET_AI_ENTRIES !== 'off'

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
  installAppIcons()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  // Windows would give each window Electron's own menu bar (with Reload and the developer tools);
  // Duet's menu is the tray's.
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  // Sign-in and Duet's server come first: the models reach OpenAI through it (src/main/account).
  const { account, server } = setupAccount(() => home.open())
  account?.register()

  let models: Models | undefined
  let modelError: string | undefined
  try {
    models = createModels()
  } catch (error) {
    modelError = error instanceof Error ? error.message : String(error)
  }

  let voice: VoiceModels | undefined
  try {
    // Words and lines said are kept on disk and played again from there.
    voice = createVoiceModels(process.env, join(app.getPath('userData'), 'speech'))
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
  // Explain and the Script open over the video, where the strip is placed (placement, below).
  const panel = new Panel({ watcher, settings, replay: replayMoment, videoFrame: () => placement.videoFrame })
  // How a line was said, from the audio; Explain and the spoken-language check both ask.
  const hear = (moment: Moment, signal: AbortSignal): ReturnType<typeof hearLine> =>
    hearLine(moment, { audio, player, listener: voice?.listener }, signal)
  const demo = demoEnabled()
  // Listen to the browser only while a video is being watched in it.
  watcher.on('status', (status) => audio.listen(watcher.currentVideo ? status.bundle : undefined))
  // Cards live in the home base; open() shows one there.
  const cards = new Cards({
    open: (cardId) => home.open('cards', cardId)
  })
  // The knowledge ladder: each word met and what the learner did with it (src/main/knowledge).
  const knowledge = new Knowledge()
  // Explain and the conversation about a line are one: the explanation first, then text or voice
  // with the tutor, which reads and saves cards in the same collection as My cards.
  // Live voice minutes on Duet's server; at the cap the server ends the call and voice says why.
  const liveMeter = server && new LiveMeter(server, (sentence) => tutor.stopVoice(sentence))
  const tutor = new Tutor(player, cards, knowledge, liveMeter)
  const explain = new Explain({
    explainer: models?.explainer,
    replay: replayMoment,
    panel,
    tutor,
    hear,
    tts: voice?.tts
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
  // The strip shows while a video is open (and hides when it closes); the show/hide key overrides it.
  const stripShown = stripFollowsVideo(overlay, watcher)
  // The watch log: videos, lines met, words and study days, for the daily session, checkpoints and
  // the streak (src/main/watchlog). Watching counts only while the strip is shown.
  const watchLog = new WatchLog()
  // Progress: how much of each video the learner understands, then and now, and its reading level.
  const progress = new Progress({ log: watchLog, knowledge })
  const logLink = connectWatchLog(watchLog, {
    watcher,
    player,
    settings,
    cards,
    knowledge,
    progress,
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
  // Watching, as the watch log counts it: Duet's server counts the same time on its own clock.
  const watching = (): boolean => !!watcher.currentVideo && !overlay.isDestroyed() && overlay.isVisible() && player.playing
  const serverWatch = server && new ServerWatch(server)
  // The home base: opened from the Dock, the menu bar, the strip's ⚙ and when Duet starts.
  // Closing it ends Talk's conversation: its previews, its hold on the video and its voice minutes.
  const home = new Home({
    log: watchLog,
    cards,
    settings,
    knowledge,
    openWelcome: () => welcome.open(true),
    closed: () => tutor.end(home)
  })
  // Feedback from the home base (Settings) or the side panel: to Duet's server (on to Discord) and Sentry.
  connectFeedback({ server, account, settings, owns: (sender) => home.owns(sender) || panel.owns(sender) })
  // The side panel is drawn as the home base is, light or dark.
  panel.setDark(home.dark)
  home.onLook((dark) => panel.setDark(dark))
  connectProgress(progress, { owns: (sender) => home.owns(sender), send: (channel) => home.send(channel, null) })
  // Lines kept from before progress are tallied once the windows are up, not before them.
  setTimeout(() => progress.catchUp(), CATCH_UP_AFTER_MS)
  // Talk in the home base: a free conversation with Duet, in the language being learnt.
  const talk = new Talk({ tutor, settings, window: home })
  // The plan and its meters in the home base; read again when a video starts and when Duet comes
  // back to the front (after paying in the browser).
  const accountLink = connectAccount({ account, server, home })
  let videoSeen: string | undefined
  watcher.on('status', () => {
    const video = watcher.currentVideo && `${watcher.currentVideo.site}:${watcher.currentVideo.id}`
    if (video && video !== videoSeen) void accountLink.refresh()
    videoSeen = video
  })
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
  // The flashcards page in Your words: Review, Words and Collections (src/main/flashcards).
  new Flashcards({
    cards,
    knowledge,
    owns: (sender) => home.owns(sender),
    window: () => BrowserWindow.getFocusedWindow(),
    replay: replayMoment,
    currentVideo: () => watcher.currentVideo,
    voice: voice && { tts: voice.tts, coach: voice.coach, stt: voice.speechToText },
    quiz,
    // Card backs' dictionary entries: the offline packs first, then the same AI as the lines for
    // a word the pack lacks (AI_ENTRY_FALLBACK turns that off).
    dictionary: new Dictionary(models?.entries, {
      packs: new Packs(packFolder(app.getAppPath())),
      aiFallback: AI_ENTRY_FALLBACK
    })
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
  // The strip's page reloaded or crashed: a checkpoint it had open goes with it, and so does its
  // conversation (and any voice call's minutes on Duet's server).
  const stripGone = (): void => {
    checkpoints.reset()
    tutor.end(strip)
  }
  overlay.webContents.on('did-start-loading', stripGone)
  overlay.webContents.on('render-process-gone', stripGone)
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
    show: new Shortcut(settings.current.shortcut, () => stripShown.toggle()),
    talk: new Shortcut(settings.current.talkShortcut, () => {
      if (!overlay.isVisible()) stripShown.show()
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
  // Started again while it runs (Windows' Start menu or desktop shortcut; the Dock on macOS gives
  // 'activate' instead): the copy that runs opens, as the second one quits.
  app.on('second-instance', open)
  app.on('activate', () => void accountLink.refresh())
  settings.on('change', (_, changed) => {
    if (changed.onboarded) {
      home.open()
      track('onboarding_done')
    }
  })
  // Duet's own updates (never from source): the menu bar and Settings show them; an answer to "Check
  // for updates" in the menu bar is a notification, kept like the reminder's.
  let shownUpdate: Notification | undefined
  const updates = new Updates({
    notify: (text) => {
      shownUpdate = new Notification({ title: 'Duet', body: text })
      shownUpdate.show()
    }
  })
  connectUpdates(updates, { owns: (sender) => home.owns(sender), send: (channel, value) => home.send(channel, value) })
  updates.start()
  tray = createTray({
    openHome: () => home.open(),
    toggleOverlay: () => stripShown.toggle(),
    showScript,
    explainLine: () => explainLine(),
    openCards: () => home.open('cards'),
    sendFeedback: () => {
      home.open('settings')
      // Once the page is up (it may have only just opened), Settings goes to the feedback box.
      setTimeout(() => home.send('home:feedback', null), 700)
    },
    openWelcome: () => welcome.open(true),
    updates
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
    serverWatch?.tick(watching())
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
    updates.stop()
    tray?.destroy()
    void stopUsage()
    account?.cleanup()
  })
})

// The overlay can be hidden, but Duet keeps running in the tray until quit from there.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
