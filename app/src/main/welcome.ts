// First run: opens the welcome window until the learner has been through it once. Settings and the
// menu can replay it as a demo, which saves no choices (welcome.html?replay=1; see welcome/flow.ts).
//
// IPC (all "welcome:*"; the page reaches them through window.duet.welcome in src/preload/welcome.ts):
//   welcome:open-settings   opens the System Settings pane for a permission
//   welcome:ask-audio       asks for System Audio Recording (the macOS prompt, first time only)
//   welcome:done            the learner finished; don't show again
// The page reads the language, level and permission states through the overlay's own state.
import { ipcMain, shell, type BrowserWindow } from 'electron'
import type { AudioSource } from './audio'
import type { Settings } from './settings'
import { createWelcomeWindow } from './windows/welcome'

const PRIVACY = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  audio: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  // For voice in the side panel, when the microphone was refused.
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
}

export class Welcome {
  private window?: BrowserWindow

  constructor(
    private settings: Settings,
    audio: AudioSource
  ) {
    ipcMain.on('welcome:open-settings', (_, pane: keyof typeof PRIVACY) => {
      if (PRIVACY[pane]) void shell.openExternal(PRIVACY[pane])
    })
    ipcMain.on('welcome:ask-audio', () => audio.requestPermission())
    ipcMain.on('welcome:done', () => {
      settings.update({ onboarded: true })
      this.window?.close()
    })
  }

  /** Shows the welcome window if it hasn't been finished yet; with `replay`, as a demo, any time. */
  open(replay = false): void {
    if (!replay && this.settings.current.onboarded) return
    if (this.window && !this.window.isDestroyed()) return void this.window.focus()
    // Before the first run is through, even a replay is the real thing: its choices are saved.
    this.window = createWelcomeWindow(replay && this.settings.current.onboarded)
    this.window.on('closed', () => (this.window = undefined))
  }
}
