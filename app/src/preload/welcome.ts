// The first-run window's bridge to the main process (src/main/welcome.ts).
import { ipcRenderer } from 'electron'

export const welcomeApi = {
  /** Only macOS asks for permissions (Accessibility, System Audio Recording); Windows needs none. */
  asksPermissions: process.platform === 'darwin',
  /** Opens the System Settings pane where a permission is switched on (the side panel uses
   * 'microphone' when voice was refused the microphone). */
  openSettings: (pane: 'accessibility' | 'audio' | 'microphone') => ipcRenderer.send('welcome:open-settings', pane),
  /** Asks for System Audio Recording (the macOS prompt shows the first time only). */
  askAudio: () => ipcRenderer.send('welcome:ask-audio'),
  /** The learner is done; the window closes and won't open again by itself. */
  done: () => ipcRenderer.send('welcome:done')
}
