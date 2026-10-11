// Duet's main process: the overlay, its global shortcut and tray menu, and the path a caption takes
// from the caption reader, through the line model, to the overlay.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { Language, Level, OverlaySettings, OverlayStatus } from '../shared/types'
import { createLineModel } from './ai'
import { CaptionSource, type CaptionStatus } from './captions'
import { createOverlay, toggleOverlay } from './overlay'
import { LineSession } from './session'

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

const settings: OverlaySettings = { language: 'es', level: 2, guessFirst: true }
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

  let session: LineSession | undefined
  try {
    session = new LineSession(createLineModel(), settings.language)
    setStatus({ model: session.modelName })
    session.on('line', (line) => send('duet:line', line))
    if (is.dev)
      session.on('line', (line) =>
        console.log(`[duet] line ${line.id} ${line.state}: ${line.original}${line.processed ? ` → ${line.processed.translation}` : ''}${line.error ? ` (${line.error})` : ''}`)
      )
    session.on('model-error', (message: string) => setStatus({ modelError: message }))
  } catch (error) {
    setStatus({ modelError: error instanceof Error ? error.message : String(error) })
  }

  const captions = new CaptionSource()
  let lastUrl: string | undefined
  captions.on('status', (change: CaptionStatus) => {
    // A different video starts a fresh session.
    if (change.url && change.url !== lastUrl) {
      if (lastUrl) session?.reset()
      lastUrl = change.url
    }
    setStatus({ ...change, error: change.error })
  })
  captions.on('live', (line: { text: string }) => send('duet:live', line.text))
  captions.on('line', (line: { text: string; at: number }) => session?.add(line.text, line.at))
  captions.start()

  ipcMain.handle('duet:get-state', () => ({ settings, status }))
  ipcMain.on('duet:set-language', (_, language: Language) => {
    if (language === settings.language) return
    settings.language = language
    session?.reset(language)
    send('duet:settings', settings)
  })
  ipcMain.on('duet:set-level', (_, level: Level) => {
    settings.level = level
    send('duet:settings', settings)
  })
  ipcMain.on('duet:set-guess-first', (_, on: boolean) => {
    settings.guessFirst = on
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
