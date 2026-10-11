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

const duet = { ...overlayApi, tutor: tutorApi, panel: panelApi, explain: explainApi, cards: cardsApi, checkpoint: checkpointApi, home: homeApi, daily: dailyApi, knowledge: knowledgeApi, talk: talkApi, welcome: welcomeApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)
