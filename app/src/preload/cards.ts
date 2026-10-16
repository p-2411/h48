// Cards for any page (src/main/cards): Explain saves them, the flashcards page edits them.
import type { Card, CardContent, CardDetail, CardDraft, CardQuery, SaveResult } from '../shared/cards'
import { invoke } from './invoke'
import { subscribe } from './subscribe'

export const cardsApi = {
  list: (query: CardQuery = {}) => invoke<Card[]>('cards:list', query),
  get: (id: string) => invoke<CardDetail | undefined>('cards:get', id),
  /** Saves a draft; finds the same card instead unless `again`. */
  save: (draft: CardDraft, again = false) => invoke<SaveResult>('cards:save', draft, again),
  /** A correction: scheduling is kept. */
  update: (id: string, content: CardContent) => invoke<Card>('cards:update', id, content),
  /** A change to what is tested: a new card, scheduled from scratch. */
  saveAsNew: (id: string, content: CardContent) => invoke<Card>('cards:save-as-new', id, content),
  setPaused: (id: string, paused: boolean) => invoke<void>('cards:pause', id, paused),
  remove: (id: string) => invoke<void>('cards:delete', id),
  restore: (id: string) => invoke<void>('cards:restore', id),

  exportBackup: () => invoke<string | undefined>('cards:export-backup'),
  exportText: () => invoke<string | undefined>('cards:export-text'),
  restoreBackup: () => invoke<{ cards: number; reviews: number } | undefined>('cards:restore-backup'),

  /** Opens My cards, on one card when given. */
  open: (id?: string) => invoke<void>('cards:open', id),
  onChanged: (listener: () => void) => subscribe('cards:changed', listener),
  onShow: (listener: (id: string) => void) => subscribe('cards:show', listener)
}
