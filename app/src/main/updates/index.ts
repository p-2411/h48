// Duet's own updates: a check soon after launch and every few hours, a quiet download, and the
// install when Duet quits. Restart to update (the menu bar, Settings) installs at once. Releases are
// on GitHub (electron-builder.yml › publish); app/README.md says how to make one. Never while run
// from source.
import { EventEmitter } from 'events'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater, type AppUpdater } from 'electron-updater'
import type { UpdateState, UpdateStatus } from '../../shared/updates'

// The first check waits until Duet has started; then one every few hours, for the copies left
// running for days in the menu bar.
const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 4 * 60 * 60_000

/** The part of electron-updater's autoUpdater used here (a stand-in in tests). */
export type Updater = Pick<
  AppUpdater,
  'on' | 'autoDownload' | 'autoInstallOnAppQuit' | 'checkForUpdates' | 'quitAndInstall'
>

/** Whether this copy can update itself: macOS and Windows can, Linux only as an AppImage (a .deb or
 * snap is updated by its package manager). */
function updatable(): boolean {
  return process.platform !== 'linux' || !!process.env.APPIMAGE
}

export class Updates extends EventEmitter<{ change: [UpdateStatus] }> {
  private state: UpdateState
  private updater?: Updater
  private first?: NodeJS.Timeout
  private timer?: NodeJS.Timeout
  // The learner asked from the menu bar: the answer comes back as a notification.
  private tell = false

  constructor(
    private readonly deps: {
      notify: (text: string) => void
      version?: string
      /** Defaults to: a packaged app, on a platform that can update itself. */
      enabled?: boolean
      updater?: () => Updater
    }
  ) {
    super()
    const enabled = deps.enabled ?? (!is.dev && app.isPackaged && updatable())
    this.state = enabled
      ? { kind: 'idle', checked: false }
      : { kind: 'off', reason: is.dev ? 'dev' : 'unsupported' }
    if (!enabled) return
    const updater = (this.updater = deps.updater?.() ?? autoUpdater)
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    updater.on('update-available', (release) =>
      this.set({ kind: 'downloading', version: release.version, percent: 0 })
    )
    updater.on('download-progress', ({ percent }) => {
      const state = this.state
      // Told at each whole percent, not at every chunk.
      if (state.kind === 'downloading' && Math.floor(percent) !== Math.floor(state.percent))
        this.set({ ...state, percent })
    })
    updater.on('update-not-available', () => {
      this.set({ kind: 'idle', checked: true })
      this.answer('Duet is up to date.')
    })
    updater.on('update-downloaded', (release) => {
      // Nothing more to look for until it is installed.
      clearInterval(this.timer)
      this.set({ kind: 'ready', version: release.version })
      this.answer(
        `Duet ${release.version} is ready. Restart to update from the menu bar, or it installs when you quit.`
      )
    })
    updater.on('error', (error) => {
      console.warn('Updates:', error.message)
      const message =
        this.state.kind === 'downloading'
          ? 'Couldn’t download the update. Duet will try again later.'
          : 'Couldn’t look for updates. Duet will try again later.'
      this.set({ kind: 'failed', message })
      this.answer(message)
    })
  }

  get status(): UpdateStatus {
    return { version: this.deps.version ?? app.getVersion(), state: this.state }
  }

  /** Looks soon, then every few hours. */
  start(): void {
    if (!this.updater) return
    this.first = setTimeout(() => this.check(), FIRST_CHECK_MS)
    this.timer = setInterval(() => this.check(), CHECK_EVERY_MS)
  }

  /** Looks for a newer version now (and downloads it); `tell` answers with a notification. Nothing
   * while a check or download is under way, or once one is ready. */
  check({ tell = false }: { tell?: boolean } = {}): void {
    const kind = this.state.kind
    if (!this.updater || kind === 'checking' || kind === 'downloading' || kind === 'ready') return
    this.tell = tell
    // A failure also arrives as 'error', which says so.
    this.updater.checkForUpdates().catch(() => {})
  }

  /** Installs the downloaded update and opens Duet again. */
  restart(): void {
    if (this.state.kind === 'ready') this.updater?.quitAndInstall()
  }

  stop(): void {
    clearTimeout(this.first)
    clearInterval(this.timer)
  }

  private set(state: UpdateState): void {
    this.state = state
    this.emit('change', this.status)
  }

  private answer(text: string): void {
    if (this.tell) this.deps.notify(text)
    this.tell = false
  }
}
