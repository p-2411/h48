// What every Duet page can reach as window.duet: one section per window, each in its own file, so
// work on one window never touches another's bridge.
import { contextBridge } from 'electron'
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

const duet = { platform: process.platform, ...overlayApi, tutor: tutorApi, panel: panelApi, explain: explainApi, cards: cardsApi, checkpoint: checkpointApi, home: homeApi, daily: dailyApi, knowledge: knowledgeApi, talk: talkApi, welcome: welcomeApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)

// Styles can follow the OS (html[data-platform='win32']): macOS insets its window buttons in the
// page, while Windows draws its own title bar above it.
window.addEventListener('DOMContentLoaded', () => (document.documentElement.dataset.platform = process.platform))
