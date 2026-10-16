// What every Duet page can reach as window.duet: one section per window, each in its own file, so
// work on one window never touches another's bridge.
import { contextBridge, ipcRenderer } from 'electron'
import { accountApi } from './account'
import { cardsApi } from './cards'
import { checkpointApi } from './checkpoint'
import { explainApi } from './explain'
import { flashcardsApi } from './flashcards'
import { homeApi } from './home'
import { knowledgeApi } from './knowledge'
import { dailyApi } from './daily'
import { overlayApi } from './overlay'
import { panelApi } from './panel'
import { progressApi } from './progress'
import { talkApi } from './talk'
import { tutorApi } from './tutor'
import { updatesApi } from './updates'
import { welcomeApi } from './welcome'

// Whether this Duet sends crash reports (src/main/reports): asked once, as the page loads, so a page
// starts reporting exactly when the main process does.
const reports = ipcRenderer.sendSync('duet:reports') === true

const duet = { platform: process.platform, ...overlayApi, reports, tutor: tutorApi, panel: panelApi, explain: explainApi, cards: cardsApi, flashcards: flashcardsApi, checkpoint: checkpointApi, home: homeApi, daily: dailyApi, knowledge: knowledgeApi, progress: progressApi, talk: talkApi, updates: updatesApi, welcome: welcomeApi, account: accountApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)

// Styles can follow the OS (html[data-platform='win32']): macOS insets its window buttons in the
// page, while Windows draws its own title bar above it.
window.addEventListener('DOMContentLoaded', () => (document.documentElement.dataset.platform = process.platform))
