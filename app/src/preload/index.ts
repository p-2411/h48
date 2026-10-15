// What every Duet page can reach as window.duet: one section per window, each in its own file, so
// work on one window never touches another's bridge.
import { contextBridge, ipcRenderer } from 'electron'
import { cardsApi } from './cards'
import { checkpointApi } from './checkpoint'
import { explainApi } from './explain'
import { homeApi } from './home'
import { knowledgeApi } from './knowledge'
import { dailyApi } from './daily'
import { overlayApi } from './overlay'
import { panelApi } from './panel'
import { talkApi } from './talk'
import { tutorApi } from './tutor'
import { welcomeApi } from './welcome'

// Whether this Duet sends crash reports (src/main/reports): asked once, as the page loads, so a page
// starts reporting exactly when the main process does.
const reports = ipcRenderer.sendSync('duet:reports') === true

const duet = { ...overlayApi, reports, tutor: tutorApi, panel: panelApi, explain: explainApi, cards: cardsApi, checkpoint: checkpointApi, home: homeApi, daily: dailyApi, knowledge: knowledgeApi, talk: talkApi, welcome: welcomeApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)
