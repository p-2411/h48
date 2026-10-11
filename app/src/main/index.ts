import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { DuetDatabase } from './database'
import { assessPronunciation, explainMoment, tutorReply } from './services'
import type {
  AppSettings,
  Moment,
  ReviewInput,
  SaveCardInput,
  TutorTurn,
  UpdateCardInput
} from '../shared/types'

let database: DuetDatabase | null = null

function getDatabase(): DuetDatabase {
  if (!database) throw new Error('DATABASE_NOT_READY')
  return database
}

function registerIpc(): void {
  ipcMain.handle('duet:explain', (_, moment: Moment) => explainMoment(moment))
  ipcMain.handle('duet:tutor', (_, moment: Moment, turns: TutorTurn[]) => tutorReply(moment, turns))
  ipcMain.handle('duet:pronunciation', (_, moment: Moment, audio: ArrayBuffer) =>
    assessPronunciation(moment, audio)
  )
  ipcMain.handle('duet:cards:list', () => getDatabase().listCards())
  ipcMain.handle('duet:cards:create', (_, input: SaveCardInput) => getDatabase().createCard(input))
  ipcMain.handle('duet:cards:update', (_, input: UpdateCardInput) =>
    getDatabase().updateCard(input)
  )
  ipcMain.handle('duet:cards:delete', (_, id: string) => getDatabase().deleteCard(id))
  ipcMain.handle('duet:reviews:queue', () => getDatabase().getReviewQueue())
  ipcMain.handle('duet:reviews:preview', (_, cardId: string) => getDatabase().previewReview(cardId))
  ipcMain.handle('duet:reviews:rate', (_, input: ReviewInput) => getDatabase().reviewCard(input))
  ipcMain.handle('duet:reviews:undo', (_, cardId: string) => getDatabase().undoLatestReview(cardId))
  ipcMain.handle('duet:settings:get', () => getDatabase().getSettings())
  ipcMain.handle('duet:settings:save', (_, settings: AppSettings) =>
    getDatabase().saveSettings(settings)
  )
  ipcMain.handle('duet:data:export', () => getDatabase().exportBackup())
  ipcMain.handle('duet:data:import', (_, payload: string) => getDatabase().importBackup(payload))
  ipcMain.handle('duet:data:clear', () => getDatabase().clearAllData())
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Duet',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.useduet.app')
  database = new DuetDatabase(join(app.getPath('userData'), 'duet.sqlite'))
  registerIpc()

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  database?.close()
  database = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
