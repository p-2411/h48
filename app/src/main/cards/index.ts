// Cards, main-process side: everything the windows can ask about cards. My cards is a place in the
// home base (src/main/home), which opens it.
// Storing is store.ts, scheduling scheduler.ts, the review queue review.ts.
//
// IPC (all "cards:*"; pages reach them through window.duet.cards in src/preload/cards.ts):
//   list, get, save, update, save-as-new, pause, delete, restore    the collection
//   review-start, review-queue, rate, skip, undo                     reviewing
//   get-settings, set-settings                                       review settings
//   export-backup, export-text, restore-backup                       files
//   open, replay, practise, review                                   going elsewhere
// The class emits "changed" (with the due counts) when cards change (the home base reloads them),
// and "saved" (the new card) when a card is saved, for the watch log.
import { EventEmitter } from 'events'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import type {
  Card,
  CardContent,
  CardDetail,
  CardDraft,
  CardQuery,
  Rating,
  ReviewQueue,
  ReviewSettings,
  SaveResult
} from '../../shared/cards'
import type { DueCounts } from '../../shared/types'
import type { Moment } from '../../shared/moment'
import { readSetting, writeSetting } from '../store/db'
import { reviewCounts, ReviewSession } from './review'
import { Scheduler } from './scheduler'
import { CardStore, UNDO_DELETE_MS } from './store'

const SETTINGS_KEY = 'review'
const DEFAULT_SETTINGS: ReviewSettings = { desiredRetention: 0.9, newPerDay: 10 }

function loadSettings(): ReviewSettings {
  return { ...DEFAULT_SETTINGS, ...readSetting<Partial<ReviewSettings>>(SETTINGS_KEY) }
}

export class Cards extends EventEmitter {
  private store = new CardStore()
  private settings = loadSettings()
  private scheduler = new Scheduler(this.settings)
  private review = new ReviewSession(
    this.store,
    () => this.scheduler,
    () => this.settings
  )
  private voiceReview = new ReviewSession(
    this.store,
    () => this.scheduler,
    () => this.settings
  )

  constructor({
    replay,
    practise,
    open,
    openReview
  }: {
    replay: (moment: Moment) => void
    practise: (moment: Moment) => void
    /** Opens My cards, on one card when given. */
    open: (cardId?: string) => void
    openReview: () => void
  }) {
    super()
    this.store.purge()
    const handle = (channel: string, work: (...args: never[]) => unknown): void => {
      ipcMain.handle(`cards:${channel}`, (_, ...args) => work(...(args as never[])))
    }
    // File dialogs open over the window that asked.
    const handleFrom = (channel: string, work: (parent: BrowserWindow | null) => unknown): void => {
      ipcMain.handle(`cards:${channel}`, (event) =>
        work(BrowserWindow.fromWebContents(event.sender))
      )
    }
    // Tells My cards to reload once the work is done (after it settles, for async work).
    const changing =
      <A extends unknown[], R>(work: (...args: A) => R) =>
      (...args: A): R => {
        const result = work(...args)
        if (result instanceof Promise)
          void result.finally(() => this.changed()).catch(() => undefined)
        else this.changed()
        return result
      }

    handle('list', (query: CardQuery) => this.store.list(query))
    handle('get', (id: string) => this.store.get(id))
    handle('save', (draft: CardDraft, again?: boolean) => this.saveDraft(draft, { again }))
    handle(
      'update',
      changing((id: string, content: CardContent) => this.store.update(id, content))
    )
    handle(
      'save-as-new',
      changing((id: string, content: CardContent) =>
        this.store.saveAsNew(id, content, this.scheduler)
      )
    )
    handle(
      'pause',
      changing((id: string, paused: boolean) => this.store.setPaused(id, paused))
    )
    handle('delete', (id: string) => this.remove(id))
    handle(
      'restore',
      changing((id: string) => this.store.restore(id))
    )

    handle('review-start', () => {
      this.review.restart()
      return this.review.queue()
    })
    handle('review-queue', () => this.review.queue())
    handle(
      'rate',
      changing((cardId: string, revision: number, rating: Rating, eventId: string) =>
        this.review.rate(cardId, revision, rating, eventId)
      )
    )
    handle('skip', (cardId: string) => this.review.skip(cardId))
    handle(
      'undo',
      changing(() => this.review.undo())
    )

    handle('get-settings', () => this.settings)
    handle('set-settings', (change: Partial<ReviewSettings>) => {
      const desiredRetention = Math.min(
        0.97,
        Math.max(0.8, Number(change.desiredRetention ?? this.settings.desiredRetention))
      )
      const newPerDay = Math.min(
        100,
        Math.max(0, Math.round(Number(change.newPerDay ?? this.settings.newPerDay)))
      )
      this.settings = { desiredRetention, newPerDay }
      this.scheduler = new Scheduler(this.settings)
      writeSetting(SETTINGS_KEY, this.settings)
      return this.settings
    })

    handleFrom('export-backup', (parent) =>
      this.saveFile(
        parent,
        `duet-cards-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(this.store.backup(this.scheduler), null, 2),
        'json'
      )
    )
    handleFrom('export-text', (parent) =>
      this.saveFile(parent, 'duet-cards.tsv', this.store.textExport(), 'tsv')
    )
    handleFrom(
      'restore-backup',
      changing(async (parent: BrowserWindow | null) => {
        const options = {
          filters: [{ name: 'Duet backup', extensions: ['json'] }],
          properties: ['openFile' as const]
        }
        const result = await (parent
          ? dialog.showOpenDialog(parent, options)
          : dialog.showOpenDialog(options))
        if (result.canceled || !result.filePaths[0]) return undefined
        return this.store.restoreBackup(JSON.parse(await readFile(result.filePaths[0], 'utf8')))
      })
    )

    handle('open', (id?: string) => open(id))
    handle('review', () => openReview())
    const momentOf = (id: string): Moment | undefined => {
      const card = this.store.get(id)
      return card?.source.kind === 'video' ? card.source.moment : undefined
    }
    handle('replay', (id: string) => {
      const moment = momentOf(id)
      if (moment) replay(moment)
    })
    handle('practise', (id: string) => {
      const moment = momentOf(id)
      if (moment) practise(moment)
    })
  }

  /** Cards ready to review now. */
  counts(): DueCounts {
    const { due, newAvailable } = reviewCounts(this.settings.newPerDay)
    return { due, newAvailable }
  }

  /** Saves a card; the same card already saved is found instead, unless `again` saves it anyway.
   * Emits "saved" with a newly saved card (the watch log records it). */
  saveDraft(draft: CardDraft, { again }: { again?: boolean } = {}): SaveResult {
    const result = this.store.save(draft, this.scheduler, { again })
    this.changed()
    if ('saved' in result) this.emit('saved', result.saved)
    return result
  }

  /** Deletes a card (undoable for a while, see CardStore.remove), then removes it for good. */
  remove(id: string): void {
    this.store.remove(id)
    setTimeout(() => this.store.purge(), UNDO_DELETE_MS + 1000)
    this.changed()
  }

  /** The voice tutor uses the same collection and scheduler as My cards. These methods keep that
   * integration in one place instead of creating a second database or review implementation. */
  searchForTutor(query: string, limit = 5): Card[] {
    const count = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.round(limit))) : 5
    return this.store.list({ search: query, limit: count })
  }

  getForTutor(cardId: string): CardDetail {
    const card = this.store.get(cardId)
    if (!card) throw new Error('CARD_NOT_FOUND')
    return card
  }

  prepareTutorReview(cardId: string): NonNullable<ReviewQueue['next']> & { card: CardDetail } {
    const preview = this.voiceReview.present(cardId)
    return { ...preview, card: this.getForTutor(preview.card.id) }
  }

  rateTutorReview(cardId: string, revision: number, rating: Rating, eventId: string): CardDetail {
    this.voiceReview.commitRating(cardId, revision, rating, eventId)
    this.changed()
    return this.getForTutor(cardId)
  }

  /** Undoes the tutor's rating `eventId`, only if it is still the tutor's latest rating. */
  undoTutorReview(cardId: string, eventId: string): CardDetail {
    this.voiceReview.undoEvent(eventId)
    this.changed()
    return this.getForTutor(cardId)
  }

  /** A new tutor session (another moment, or the window closed): skips and undo start over. */
  resetTutorReview(): void {
    this.voiceReview.restart()
  }

  removeTutorCard(cardId: string): void {
    const card = this.getForTutor(cardId)
    if (card.revision !== 1 || card.reps !== 0) throw new Error('CARD_CANNOT_BE_UNDONE')
    this.remove(cardId)
  }

  seedDemoFixtures(moment: Moment): void {
    if (this.store.hasCards()) return
    this.store.save(
      {
        type: 'understand',
        expression: moment.line.original,
        meaning: "I mean, it isn't like I intended it that way.",
        target:
          'Recall how ていうか redirects the thought and つもりじゃなかった denies a past intention.',
        situation: 'The speaker is correcting the impression created by the previous exchange.',
        language: moment.language,
        source: { kind: 'video', moment }
      },
      this.scheduler
    )
    this.store.save(
      {
        type: 'understand',
        expression: 'ちょっと待って、そんなつもりじゃなかった。',
        meaning: "Wait, that isn't what I intended.",
        target: 'Recall the phrase and notice the consonant timing in ちょっと.',
        situation: 'A quick correction after the listener misunderstood an intention.',
        language: 'ja',
        source: { kind: 'tutor' }
      },
      this.scheduler
    )
    this.changed()
  }

  private changed(): void {
    this.emit('changed', this.counts())
  }

  private async saveFile(
    parent: BrowserWindow | null,
    name: string,
    contents: string,
    extension: string
  ): Promise<string | undefined> {
    const options = {
      defaultPath: name,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    }
    const result = await (parent
      ? dialog.showSaveDialog(parent, options)
      : dialog.showSaveDialog(options))
    if (result.canceled || !result.filePath) return undefined
    await writeFile(result.filePath, contents, 'utf8')
    return result.filePath
  }
}
