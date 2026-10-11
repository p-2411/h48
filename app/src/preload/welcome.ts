// The first-run window's bridge to the main process (src/main/welcome.ts).
import { ipcRenderer } from 'electron'

export const welcomeApi = {
  /** Opens the System Settings pane where a permission is switched on. */
  openSettings: (pane: 'accessibility' | 'audio') => ipcRenderer.send('welcome:open-settings', pane),
  /** Asks for System Audio Recording (the macOS prompt shows the first time only). */
  askAudio: () => ipcRenderer.send('welcome:ask-audio'),
  /** The learner is done; the window closes and won't open again by itself. */
  done: () => ipcRenderer.send('welcome:done')
}
