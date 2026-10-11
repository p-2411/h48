// The tutor page's bridge to the main process (src/main/tutor). Add the tutor's calls here, all on
// "tutor:*" channels.
import { ipcRenderer } from 'electron'
import type { Moment } from '../shared/moment'
import { subscribe } from './subscribe'

export const tutorApi = {
  /** The moment the tutor was opened on. */
  getMoment: (): Promise<Moment | undefined> => ipcRenderer.invoke('tutor:get-moment'),
  /** The tutor was opened again on another moment. */
  onMoment: (listener: (moment: Moment) => void) => subscribe('tutor:moment', listener),
  close: () => ipcRenderer.send('tutor:close')
}
