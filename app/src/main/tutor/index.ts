// Main-process owner of the tutor window, GPT-Live handshake and local learning tools. All state
// changes pass through this class so the voice model cannot bypass confirmation or FSRS rules.
import { randomUUID } from 'node:crypto'
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { CardDraft } from '../../shared/cards'
import type { Moment } from '../../shared/moment'
import type {
  PendingTutorAction,
  ReviewRating,
  TutorActionResult,
  TutorSessionOffer,
  TutorToolRequest,
  TutorToolResult
} from '../../shared/tutor'
import type { Cards } from '../cards'
import type { Player } from '../player'
import { createTutorWindow } from '../windows/tutor'
import { createLiveSession, pronounceForLearner, translateForLearner } from './live'

type PendingAction =
  | { id: string; kind: 'save-card'; expiresAt: number; draft: CardDraft }
  | { id: string; kind: 'review-card'; expiresAt: number; cardId: string; expectedRevision: number }

type LastAction = { kind: 'saved-card' | 'reviewed-card'; cardId: string }

const ACTION_LIFETIME_MS = 5 * 60_000
const RATINGS = new Set<ReviewRating>(['again', 'hard', 'good', 'easy'])

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_TOOL_ARGUMENTS')
  return value as Record<string, unknown>
}

function string(value: unknown, name: string, maximum = 1_500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error(`INVALID_${name.toUpperCase()}`)
  return value.trim()
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN_TOOL_ERROR'
  const allowed = [
    'ACTION_EXPIRED',
    'ACTION_NOT_FOUND',
    'CARD_CANNOT_BE_UNDONE',
    'CARD_NOT_DUE',
    'CARD_NOT_FOUND',
    'CONTEXT_TOO_LARGE',
    'EXPLORE_REQUIRED',
    'INVALID_CARD_TEXT',
    'INVALID_REVIEW_RATING',
    'INVALID_TOOL_ARGUMENTS',
    'NO_ACTION_TO_UNDO',
    'NO_REVIEW_TO_UNDO',
    'NEW_CARD_LIMIT_REACHED',
    'SIBLING_CARD_DEFERRED',
    'STALE_CARD_REVISION',
    'STALE_UNDO'
  ]
  if (allowed.includes(error.message) || error.message.startsWith('INVALID_')) return error.message
  return 'TOOL_FAILED'
}

export class Tutor {
  private window?: BrowserWindow
  private moment?: Moment
  private autoStart = false
  private exploreEnabled = false
  private readonly pending = new Map<string, PendingAction>()
  private lastAction?: LastAction

  constructor(
    private readonly player: Player,
    private readonly cards: Cards
  ) {
    ipcMain.handle('tutor:get-moment', () => this.moment)
    ipcMain.handle('tutor:get-auto-start', () => this.autoStart)
    ipcMain.handle('tutor:set-explore', (event, enabled: boolean) => {
      this.assertTutor(event)
      this.exploreEnabled = enabled === true
      return this.exploreEnabled
    })
    ipcMain.handle('tutor:start-session', (event, offer: TutorSessionOffer) => {
      this.assertTutor(event)
      if (!this.moment) throw new Error('Open the tutor on a line before starting voice.')
      return createLiveSession(offer.sdp, this.moment)
    })
    ipcMain.handle('tutor:translate', (event, text: string) => {
      this.assertTutor(event)
      return translateForLearner(string(text, 'translation_text', 2_000), this.moment?.language ?? 'ja')
    })
    ipcMain.handle('tutor:pronounce', (event, text: string) => {
      this.assertTutor(event)
      return pronounceForLearner(string(text, 'pronunciation_text', 2_000), this.moment?.language ?? 'ja')
    })
    ipcMain.handle('tutor:execute-tool', (event, request: TutorToolRequest) => {
      this.assertTutor(event)
      return this.executeTool(request)
    })
    ipcMain.handle('tutor:confirm-action', (event, actionId: string, rating?: ReviewRating) => {
      this.assertTutor(event)
      return this.confirmAction(actionId, rating)
    })
    ipcMain.handle('tutor:undo', (event) => {
      this.assertTutor(event)
      return this.undoLastAction()
    })
    ipcMain.on('tutor:close', (event) => {
      if (event.sender === this.window?.webContents) this.window.close()
    })
  }

  /** Opens the tutor on a frozen moment, or moves the existing tutor to the new moment. */
  open(moment: Moment, { autoStart = false }: { autoStart?: boolean } = {}): void {
    this.moment = moment
    this.autoStart = autoStart
    this.exploreEnabled = false
    this.pending.clear()
    this.lastAction = undefined
    this.player.hold('tutor')
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('tutor:moment', moment)
      this.window.webContents.send('tutor:auto-start', autoStart)
      this.window.show()
      return
    }
    const window = (this.window = createTutorWindow())
    window.on('closed', () => {
      this.window = undefined
      this.pending.clear()
      this.lastAction = undefined
      this.player.release('tutor')
    })
  }

  private assertTutor(event: IpcMainInvokeEvent): void {
    if (!this.window || this.window.isDestroyed() || event.sender !== this.window.webContents)
      throw new Error('UNTRUSTED_TUTOR_CALLER')
  }

  private send(channel: string, value: unknown): void {
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, value)
  }

  private output(value: unknown): TutorToolResult {
    return { ok: true, output: JSON.stringify(value) }
  }

  private async executeTool(request: TutorToolRequest): Promise<TutorToolResult> {
    try {
      if (!request || typeof request.callId !== 'string' || request.callId.length > 200)
        throw new Error('INVALID_TOOL_CALL')
      const args = object(request.arguments ?? {})
      switch (request.name) {
        case 'get_current_moment': {
          if (!this.moment) throw new Error('MOMENT_NOT_FOUND')
          return this.output({
            selectedLine: this.moment.line.original,
            translation: this.moment.line.processed?.translation,
            earlierDialogue: this.moment.earlier,
            source: this.moment.video
          })
        }
        case 'search_cards': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const query = string(args.query, 'query', 120)
          const limit = typeof args.limit === 'number' ? args.limit : 5
          return this.output({ cards: this.cards.searchForTutor(query, limit) })
        }
        case 'open_card': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const card = this.cards.getForTutor(string(args.cardId, 'card_id', 100))
          this.send('tutor:card', card)
          return this.output({ status: 'opened', card })
        }
        case 'prepare_save_card': {
          const context = Array.isArray(args.context)
            ? args.context.map((line) => string(line, 'context_line', 500))
            : []
          const sourceKind =
            args.source === 'video' ? 'video' : args.source === 'tutor' ? 'tutor' : undefined
          if (!sourceKind) throw new Error('INVALID_SOURCE')
          if (sourceKind === 'video' && !this.moment) throw new Error('MOMENT_NOT_FOUND')
          const draft: CardDraft = {
            type: 'understand',
            expression: string(args.expression, 'expression', 500),
            meaning: string(args.meaning, 'meaning', 800),
            target: string(args.target, 'target', 500),
            situation: context.length ? context.join('\n') : undefined,
            language: this.moment?.language ?? 'ja',
            source:
              sourceKind === 'video' ? { kind: 'video', moment: this.moment! } : { kind: 'tutor' }
          }
          const action = this.prepareSave(draft)
          return this.output({ status: 'confirmation_required', action })
        }
        case 'confirm_save_card':
          return this.output(this.confirmAction(string(args.actionId, 'action_id', 100)))
        case 'preview_review': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const action = this.prepareReview(string(args.cardId, 'card_id', 100))
          return this.output({ status: 'rating_required', action })
        }
        case 'commit_review': {
          const rating = string(args.rating, 'rating', 10) as ReviewRating
          if (!RATINGS.has(rating)) throw new Error('INVALID_REVIEW_RATING')
          return this.output(this.confirmAction(string(args.actionId, 'action_id', 100), rating))
        }
        case 'undo_last_action':
          return this.output(this.undoLastAction())
        default:
          throw new Error('UNKNOWN_TOOL')
      }
    } catch (error) {
      return { ok: false, output: JSON.stringify({ error: safeError(error) }) }
    }
  }

  private prepareSave(draft: CardDraft): PendingTutorAction {
    const id = randomUUID()
    const expiresAt = Date.now() + ACTION_LIFETIME_MS
    this.pending.set(id, { id, kind: 'save-card', expiresAt, draft })
    const view: PendingTutorAction = {
      id,
      kind: 'save-card',
      expiresAt: new Date(expiresAt).toISOString(),
      draft: {
        expression: draft.expression,
        meaning: draft.meaning,
        target: draft.target,
        context: draft.situation ? draft.situation.split('\n').filter(Boolean) : [],
        source: draft.source.kind
      }
    }
    this.send('tutor:pending-action', view)
    return view
  }

  private prepareReview(cardId: string): PendingTutorAction {
    const { card, outcomes } = this.cards.prepareTutorReview(cardId)
    const previews = (Object.keys(outcomes) as ReviewRating[]).map((rating) => ({
      rating,
      due: outcomes[rating].due,
      intervalLabel: outcomes[rating].interval
    }))
    const id = randomUUID()
    const expiresAt = Date.now() + ACTION_LIFETIME_MS
    this.pending.set(id, {
      id,
      kind: 'review-card',
      expiresAt,
      cardId,
      expectedRevision: card.revision
    })
    const view: PendingTutorAction = {
      id,
      kind: 'review-card',
      expiresAt: new Date(expiresAt).toISOString(),
      card,
      previews
    }
    this.send('tutor:pending-action', view)
    return view
  }

  private confirmAction(actionId: string, rating?: ReviewRating): TutorActionResult {
    const action = this.pending.get(actionId)
    if (!action) throw new Error('ACTION_NOT_FOUND')
    if (action.expiresAt < Date.now()) {
      this.pending.delete(actionId)
      throw new Error('ACTION_EXPIRED')
    }

    if (action.kind === 'save-card') {
      const saved = this.cards.saveFromTutor(action.draft)
      const created = 'saved' in saved
      const card = this.cards.getForTutor(created ? saved.saved.id : saved.duplicate.id)
      this.pending.delete(actionId)
      this.lastAction = created ? { kind: 'saved-card', cardId: card.id } : undefined
      const result: TutorActionResult = {
        actionId,
        kind: created ? 'saved-card' : 'opened-existing',
        message: created ? 'Card saved.' : 'That card already exists, so Duet opened it instead.',
        card
      }
      this.send('tutor:action-result', result)
      // A newly saved card leaves the conversation; duplicates open so the learner can inspect the
      // existing encounter instead of believing a second card was created.
      if (!created) this.send('tutor:card', card)
      return result
    }

    if (!rating || !RATINGS.has(rating)) throw new Error('INVALID_REVIEW_RATING')
    const card = this.cards.rateTutorReview(
      action.cardId,
      action.expectedRevision,
      rating,
      actionId
    )
    this.pending.delete(actionId)
    this.lastAction = { kind: 'reviewed-card', cardId: card.id }
    const result: TutorActionResult = {
      actionId,
      kind: 'reviewed-card',
      message: `Review saved as ${rating}.`,
      card
    }
    this.send('tutor:action-result', result)
    this.send('tutor:card', card)
    return result
  }

  private undoLastAction(): TutorActionResult {
    const action = this.lastAction
    if (!action) throw new Error('NO_ACTION_TO_UNDO')
    let card
    if (action.kind === 'saved-card') this.cards.removeTutorCard(action.cardId)
    else card = this.cards.undoTutorReview(action.cardId)
    this.lastAction = undefined
    const result: TutorActionResult = {
      actionId: randomUUID(),
      kind: 'undone',
      message: action.kind === 'saved-card' ? 'Saved card removed.' : 'Review undone.',
      card
    }
    this.send('tutor:action-result', result)
    if (card) this.send('tutor:card', card)
    return result
  }
}
