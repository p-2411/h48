// What every Duet page can reach as window.duet: one section per window, each in its own file, so
// work on one window never touches another's bridge.
import { contextBridge } from 'electron'
import { cardsApi } from './cards'
import { explainApi } from './explain'
import { overlayApi } from './overlay'
import { tutorApi } from './tutor'

const duet = { ...overlayApi, tutor: tutorApi, explain: explainApi, cards: cardsApi }

export type DuetApi = typeof duet

contextBridge.exposeInMainWorld('duet', duet)
