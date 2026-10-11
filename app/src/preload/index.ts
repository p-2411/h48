// What every Duet page can reach as window.duet: one section per window, each in its own file, so
// work on one window never touches another's bridge.
import { contextBridge } from 'electron'
import { cardsApi } from './cards'
import { explainApi } from './explain'
import { homeApi } from './home'
import { overlayApi } from './overlay'
import { panelApi } from './panel'
import { tutorApi } from './tutor'
import { welcomeApi } from './welcome'

const duet = { ...overlayApi, tutor: tutorApi, panel: panelApi, explain: explainApi, cards: cardsApi, home: homeApi, welcome: welcomeApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)
