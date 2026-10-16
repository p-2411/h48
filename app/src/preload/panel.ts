// The side panel's bridge to the main process (src/main/panel): tabs and the Script.
import { ipcRenderer } from 'electron'
import type { OverlayLine, PanelTab, Script } from '../shared/types'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const panelApi = {
  getState: () => invoke<{ tab: PanelTab; script: Script; current: number | null }>('panel:get-state'),
  /** The panel was asked to show a tab (Explain pressed, say). */
  onTab: (listener: (tab: PanelTab) => void) => subscribe('panel:tab', listener),
  setTab: (tab: PanelTab) => ipcRenderer.send('panel:set-tab', tab),
  /** Every line, again: another video or language, or the transcript arrived. */
  onScript: (listener: (script: Script) => void) => subscribe('panel:script', listener),
  /** One line added or changed (translated, say). */
  onScriptLine: (listener: (line: OverlayLine) => void) => subscribe('panel:script-line', listener),
  onCurrent: (listener: (id: number | null) => void) => subscribe('panel:current', listener),
  /** The home base's look, light or dark, which the panel follows. */
  getLook: () => invoke<{ dark: boolean }>('panel:get-look'),
  onLook: (listener: (look: { dark: boolean }) => void) => subscribe('panel:look', listener),
  /** Goes back to a line in the video. */
  seek: (lineId: number) => ipcRenderer.send('panel:seek', lineId)
}
