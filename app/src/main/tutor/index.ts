// Main-process owner of the tutor window, GPT-Live handshake and local learning tools. All state
// changes pass through this class so the voice model cannot bypass confirmation or FSRS rules.
//
// A save or a rating is two steps: prepare (a visible preview) and commit. The learner commits by
// clicking in the tutor window. The voice model can commit only when the learner spoke after the
// preview appeared: the tutor window reports each learner turn ("tutor:learner-turn"), and a
// commit tool call with no learner turn since the preview is refused. So the model can not
// confirm its own preview.
import { randomUUID } from 'node:crypto'
import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { RATINGS, type CardDraft } from '../../shared/cards'
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
import { StaleReviewError } from '../cards/review'
import type { Player } from '../player'
import { createTutorWindow } from '../windows/tutor'
import { createLiveSession, romaniseForLearner, translateForLearner } from './live'

type PendingAction =
  | { id: string; kind: 'save-card'; preparedAt: number; expiresAt: number; draft: CardDraft }
  | {
      id: string
      kind: 'review-card'
      preparedAt: number
      expiresAt: number
      cardId: string
      expectedRevision: number
    }

// A review names its own rating (the action id is the review's event id), so undo can not reverse
// a different rating of the same card.
type LastAction =
  | { kind: 'saved-card'; cardId: string }
  | { kind: 'reviewed-card'; cardId: string; eventId: string }

const ACTION_LIFETIME_MS = 5 * 60_000
const MAX_CONTEXT_LINES = 12

function isRating(value: unknown): value is ReviewRating {
  return (RATINGS as readonly unknown[]).includes(value)
}

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

// The error codes the voice model may see. Any other error becomes TOOL_FAILED, so no internal
// detail reaches the model. Codes that start with INVALID_ (bad arguments) are also allowed.
const TOOL_ERRORS = [
  'ACTION_EXPIRED',
  'ACTION_NOT_FOUND',
  'CARD_CANNOT_BE_UNDONE',
  'CARD_NOT_DUE',
  'CARD_NOT_FOUND',
  'EXPLORE_REQUIRED',
  'LEARNER_CONFIRMATION_REQUIRED',
  'MOMENT_NOT_FOUND',
  'NEW_CARD_LIMIT_REACHED',
  'NO_ACTION_TO_UNDO',
  'SIBLING_CARD_DEFERRED',
  'UNKNOWN_TOOL'
]

function safeError(error: unknown): string {
  if (error instanceof StaleReviewError) return error.code
  if (!(error instanceof Error)) return 'UNKNOWN_TOOL_ERROR'
  if (TOOL_ERRORS.includes(error.message) || error.message.startsWith('INVALID_')) return error.message
  return 'TOOL_FAILED'
}

export class Tutor {
  private window?: BrowserWindow
  private moment?: Moment
  private autoStart = false
  private exploreEnabled = false
  private readonly pending = new Map<string, PendingAction>()
  private lastAction?: LastAction
  // When the learner last spoke, as the tutor window reports it. 0: not yet.
  private lastLearnerTurnAt = 0

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
      if (typeof offer?.sdp !== 'string') throw new Error('INVALID_SDP_OFFER')
      return createLiveSession(offer.sdp, this.moment)
    })
    ipcMain.handle('tutor:translate', (event, text: string) => {
      this.assertTutor(event)
      return translateForLearner(string(text, 'translation_text', 2_000), this.requireMoment().language)
    })
    ipcMain.handle('tutor:romanise', (event, text: string) => {
      this.assertTutor(event)
      return romaniseForLearner(string(text, 'reading_text', 2_000), this.requireMoment().language)
    })
    ipcMain.handle('tutor:execute-tool', (event, request: TutorToolRequest) => {
      this.assertTutor(event)
      return this.executeTool(request)
    })
    // The learner clicked a preview's button: this is the learner's own confirmation.
    ipcMain.handle('tutor:confirm-action', (event, actionId: string, rating?: ReviewRating) => {
      this.assertTutor(event)
      return this.confirmAction(actionId, rating)
    })
    // The learner finished a spoken turn. Only this lets the voice model commit a preview.
    ipcMain.on('tutor:learner-turn', (event) => {
      if (this.isTutor(event.sender)) this.lastLearnerTurnAt = Date.now()
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
    this.cards.resetTutorReview()
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
      this.cards.resetTutorReview()
      this.player.release('tutor')
    })
  }

  private isTutor(sender: WebContents): boolean {
    return !!this.window && !this.window.isDestroyed() && sender === this.window.webContents
  }

  private assertTutor(event: { sender: WebContents }): void {
    if (!this.isTutor(event.sender)) throw new Error('UNTRUSTED_TUTOR_CALLER')
  }

  private requireMoment(): Moment {
    if (!this.moment) throw new Error('MOMENT_NOT_FOUND')
    return this.moment
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
          const moment = this.requireMoment()
          return this.output({
            selectedLine: moment.line.original,
            translation: moment.line.processed?.translation,
            earlierDialogue: moment.earlier,
            source: moment.video
          })
        }
        case 'search_cards': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const query = string(args.query, 'query', 120)
          const limit =
            typeof args.limit === 'number' && Number.isFinite(args.limit)
              ? Math.max(1, Math.min(10, Math.round(args.limit)))
              : 5
          return this.output({ cards: this.cards.searchForTutor(query, limit) })
        }
        case 'open_card': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const card = this.cards.getForTutor(string(args.cardId, 'card_id', 100))
          this.send('tutor:card', card)
          return this.output({ status: 'opened', card })
        }
        case 'prepare_save_card': {
          if (Array.isArray(args.context) && args.context.length > MAX_CONTEXT_LINES)
            throw new Error('INVALID_CONTEXT')
          const context = Array.isArray(args.context)
            ? args.context.map((line) => string(line, 'context_line', 500))
            : []
          const sourceKind =
            args.source === 'video' ? 'video' : args.source === 'tutor' ? 'tutor' : undefined
          if (!sourceKind) throw new Error('INVALID_SOURCE')
          const moment = this.requireMoment()
          const draft: CardDraft = {
            type: 'understand',
            expression: string(args.expression, 'expression', 500),
            meaning: string(args.meaning, 'meaning', 800),
            target: string(args.target, 'target', 500),
            situation: context.length ? context.join('\n') : undefined,
            language: moment.language,
            source: sourceKind === 'video' ? { kind: 'video', moment } : { kind: 'tutor' }
          }
          const action = this.prepareSave(draft)
          return this.output({ status: 'confirmation_required', action })
        }
        case 'confirm_save_card':
          return this.output(this.confirmFromTool('save-card', string(args.actionId, 'action_id', 100)))
        case 'preview_review': {
          if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')
          const action = this.prepareReview(string(args.cardId, 'card_id', 100))
          return this.output({ status: 'rating_required', action })
        }
        case 'commit_review': {
          const rating = string(args.rating, 'rating', 10)
          if (!isRating(rating)) throw new Error('INVALID_REVIEW_RATING')
          return this.output(
            this.confirmFromTool('review-card', string(args.actionId, 'action_id', 100), rating)
          )
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
    const preparedAt = Date.now()
    const expiresAt = preparedAt + ACTION_LIFETIME_MS
    this.pending.set(id, { id, kind: 'save-card', preparedAt, expiresAt, draft })
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
    // The review session shows one card at a time, so a new preview replaces the outcomes of any
    // older one. Drop older review previews: committing one would only fail as stale.
    for (const [otherId, other] of this.pending)
      if (other.kind === 'review-card') this.pending.delete(otherId)
    const id = randomUUID()
    const preparedAt = Date.now()
    const expiresAt = preparedAt + ACTION_LIFETIME_MS
    this.pending.set(id, {
      id,
      kind: 'review-card',
      preparedAt,
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

  /** A commit asked for by the voice model. It must name an action of the right kind, and the
   * learner must have spoken after the preview appeared (see the comment at the top). */
  private confirmFromTool(
    kind: PendingAction['kind'],
    actionId: string,
    rating?: ReviewRating
  ): TutorActionResult {
    const action = this.pending.get(actionId)
    if (!action || action.kind !== kind) throw new Error('ACTION_NOT_FOUND')
    if (this.lastLearnerTurnAt <= action.preparedAt) throw new Error('LEARNER_CONFIRMATION_REQUIRED')
    return this.confirmAction(actionId, rating)
  }

  private confirmAction(actionId: string, rating?: ReviewRating): TutorActionResult {
    const action = this.pending.get(actionId)
    if (!action) throw new Error('ACTION_NOT_FOUND')
    if (action.expiresAt < Date.now()) {
      this.pending.delete(actionId)
      throw new Error('ACTION_EXPIRED')
    }

    if (action.kind === 'save-card') {
      const saved = this.cards.saveDraft(action.draft)
      const created = 'saved' in saved
      const card = this.cards.getForTutor(created ? saved.saved.id : saved.duplicate.id)
      this.pending.delete(actionId)
      // A duplicate changed nothing, so the earlier action stays the one to undo.
      if (created) this.lastAction = { kind: 'saved-card', cardId: card.id }
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

    if (!isRating(rating)) throw new Error('INVALID_REVIEW_RATING')
    const card = this.cards.rateTutorReview(
      action.cardId,
      action.expectedRevision,
      rating,
      actionId
    )
    this.pending.delete(actionId)
    this.lastAction = { kind: 'reviewed-card', cardId: card.id, eventId: actionId }
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
    try {
      if (action.kind === 'saved-card') this.cards.removeTutorCard(action.cardId)
      else card = this.cards.undoTutorReview(action.cardId, action.eventId)
    } finally {
      // Undo is tried once. If it failed, the action can not be undone later either.
      this.lastAction = undefined
    }
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
