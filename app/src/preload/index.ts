import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DuetApi,
  Moment,
  ReviewInput,
  SaveCardInput,
  TutorTurn,
  UpdateCardInput
} from '../shared/types'

const api: DuetApi = {
  explain: (moment: Moment) => ipcRenderer.invoke('duet:explain', moment),
  tutor: (moment: Moment, turns: TutorTurn[]) => ipcRenderer.invoke('duet:tutor', moment, turns),
  assessPronunciation: (moment: Moment, audio: ArrayBuffer) =>
    ipcRenderer.invoke('duet:pronunciation', moment, audio),
  listCards: () => ipcRenderer.invoke('duet:cards:list'),
  createCard: (input: SaveCardInput) => ipcRenderer.invoke('duet:cards:create', input),
  updateCard: (input: UpdateCardInput) => ipcRenderer.invoke('duet:cards:update', input),
  deleteCard: (id: string) => ipcRenderer.invoke('duet:cards:delete', id),
  getReviewQueue: () => ipcRenderer.invoke('duet:reviews:queue'),
  previewReview: (cardId: string) => ipcRenderer.invoke('duet:reviews:preview', cardId),
  reviewCard: (input: ReviewInput) => ipcRenderer.invoke('duet:reviews:rate', input),
  undoLatestReview: (cardId: string) => ipcRenderer.invoke('duet:reviews:undo', cardId),
  getSettings: () => ipcRenderer.invoke('duet:settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('duet:settings:save', settings),
  exportBackup: () => ipcRenderer.invoke('duet:data:export'),
  importBackup: (payload: string) => ipcRenderer.invoke('duet:data:import', payload),
  clearAllData: () => ipcRenderer.invoke('duet:data:clear')
}

contextBridge.exposeInMainWorld('duet', api)
