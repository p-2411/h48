// The conversation with Duet, main-process side: in the side panel's Explain tab (about a line), on
// the strip (about the line on screen) or in the home base's Talk (free), in text or voice. The window
// that opens a conversation owns it: only its page may talk to the tutor, and it hears back. It holds the line context (the line, how it was said, the explanation, the
// conversation so far), answers text messages (text.ts), starts voice sessions (live.ts), and runs
// the learning tools both use. All card changes pass through this class, so neither model can get
// round confirmation or FSRS rules.
//
// A save or a rating is two steps: prepare (a visible preview) and commit. The learner commits by
// clicking in the window. A model can commit only when the learner spoke or wrote after the preview
// appeared: each text message, and anything the learner says that the window reports (the start of
// a spoken turn, "tutor:learner-turn", and more of it as heard, "tutor:heard"), counts; a commit
// tool call with none since the preview is refused. So a model can not confirm its
// own preview.
//
// Practice words (the knowledge ladder): the tutor may record that the learner used a word in a
// sentence of their own only under practice.ts's rules (a word it was given, a sentence the learner
// said or wrote, once per turn), so a model can't pile up evidence on its own.
//
// IPC (all "tutor:*", from the window that owns the conversation; window.duet.tutor in src/preload/tutor.ts):
//   tutor:start-session / tutor:voice-ended   voice starts (holding the video) and ends
//   tutor:voice-stop   ← Duet's server ended the call (a cap): the window ends voice and says why
//   tutor:translate, tutor:romanise, tutor:execute-tool, tutor:confirm-action,
//   tutor:undo, tutor:learner-turn, tutor:heard
//   tutor:pending-action / tutor:action-result / tutor:card   ← sent to that window
import { randomUUID } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import { RATINGS, type CardDraft } from '../../shared/cards'
import type { ChatMessage } from '../../shared/explain'
import type {
  PendingTutorAction,
  ReviewRating,
  TutorActionResult,
  TutorSessionOffer,
  TutorToolRequest,
  TutorToolResult
} from '../../shared/tutor'
import type { Cards } from '../cards'
import type { Knowledge } from '../knowledge'
import { PracticeWords } from './practice'
import { StaleReviewError } from '../cards/review'
import type { Player } from '../player'
import { createLiveSession, romaniseForLearner, translateForLearner } from './live'
import { contextLanguage, type LineContext, type TutorContext } from './prompts'
import { replyInText, type TextReply } from './text'
import type { ThreadTutor } from './thread'

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
// A piece of what the learner said, as the voice window reports it, at most this long.
const MAX_HEARD = 2_000
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
  'LEARNER_TURN_REQUIRED',
  'MOMENT_NOT_FOUND',
  'NEW_CARD_LIMIT_REACHED',
  'NO_ACTION_TO_UNDO',
  'SENTENCE_NOT_HEARD',
  'SIBLING_CARD_DEFERRED',
  'UNKNOWN_TOOL',
  'WORD_NOT_OFFERED'
]

function safeError(error: unknown): string {
  if (error instanceof StaleReviewError) return error.code
  if (!(error instanceof Error)) return 'UNKNOWN_TOOL_ERROR'
  if (TOOL_ERRORS.includes(error.message) || error.message.startsWith('INVALID_')) return error.message
  return 'TOOL_FAILED'
}

/** The window a conversation lives in: whether a message came from its page, and sending to it. */
export type TutorWindow = { owns(sender: WebContents): boolean; send(channel: string, value: unknown): void }

/** Live voice minutes on Duet's server (src/main/account/live.ts); none with a development key. */
export type LiveMinutes = { started(sessionId: string): void; ended(): void }

export class Tutor {
  private context?: TutorContext
  private window?: TutorWindow
  private exploreEnabled = false
  private readonly pending = new Map<string, PendingAction>()
  private lastAction?: LastAction
  // When the learner last spoke or wrote. 0: not yet.
  private lastLearnerTurnAt = 0
  private readonly practice: PracticeWords
  // Counts voice starts and ends: a start whose call comes back after voice ended (End pressed while
  // connecting, or the window closed) must not leave the call's minutes running on Duet's server.
  private voiceRun = 0

  constructor(
    private readonly player: Player,
    private readonly cards: Cards,
    knowledge?: Pick<Knowledge, 'practiceWords' | 'noteAttempt'>,
    private readonly minutes?: LiveMinutes
  ) {
    this.practice = new PracticeWords(knowledge)
    // Voice holds the video while it is live, so Duet and the video don't talk over each other.
    ipcMain.handle('tutor:start-session', async (event, offer: TutorSessionOffer) => {
      this.assertTutor(event)
      if (!this.context) throw new Error('Open Explain on a line before starting voice.')
      if (typeof offer?.sdp !== 'string') throw new Error('INVALID_SDP_OFFER')
      this.player.hold('tutor')
      const run = ++this.voiceRun
      // Voice reads whether the saved cards are open (savedCardsOpenToDuet) from its context when it starts.
      const answer = await createLiveSession(offer.sdp, { ...this.context, exploreEnabled: this.exploreEnabled })
      this.minutes?.started(answer.sessionId)
      // Voice ended while the call was being made: the window drops it, so the server ends it too.
      if (run !== this.voiceRun) this.minutes?.ended()
      return answer
    })
    ipcMain.on('tutor:voice-ended', (event) => {
      if (!this.isTutor(event.sender)) return
      this.voiceRun++
      this.player.release('tutor')
      this.minutes?.ended()
    })
    ipcMain.handle('tutor:translate', (event, text: string) => {
      this.assertTutor(event)
      return translateForLearner(string(text, 'translation_text', 2_000), contextLanguage(this.requireContext()))
    })
    ipcMain.handle('tutor:romanise', (event, text: string) => {
      this.assertTutor(event)
      return romaniseForLearner(string(text, 'reading_text', 2_000), contextLanguage(this.requireContext()))
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
    // The learner began a spoken turn (with what was heard first, when the window has it), and the
    // rest of it as it is heard. Only these let the voice model commit a preview.
    ipcMain.on('tutor:learner-turn', (event, heard: unknown) => {
      if (this.isTutor(event.sender)) this.noteLearnerTurn(typeof heard === 'string' ? heard.slice(0, MAX_HEARD) : undefined)
    })
    ipcMain.on('tutor:heard', (event, heard: unknown) => {
      if (this.isTutor(event.sender) && typeof heard === 'string') this.noteHeard(heard.slice(0, MAX_HEARD))
    })
    ipcMain.handle('tutor:undo', (event) => {
      this.assertTutor(event)
      return this.undoLastAction()
    })
  }

  /** A new conversation, owned by `window`: earlier previews and undo end; the saved cards are open
   * to Duet when the context says so (Explain and Talk open them; the strip's talk doesn't). */
  open(context: TutorContext, window: TutorWindow): void {
    this.reset()
    this.context = context
    this.window = window
    this.exploreEnabled = context.exploreEnabled === true
  }

  private noteLearnerTurn(text?: string): void {
    this.lastLearnerTurnAt = Date.now()
    this.practice.learnerTurn(text)
  }

  /** More of the learner's spoken turn. */
  private noteHeard(text: string): void {
    this.lastLearnerTurnAt = Date.now()
    this.practice.hear(text)
  }

  /** `window`'s conversation is over (its window closed): its previews, undo and any hold on the
   * video end. Another window's conversation goes on. */
  end(window: TutorWindow): void {
    if (this.window === window) this.reset()
  }

  /** What `window` learnt about its conversation since (how the line was said, the explanation, new
   * messages). Ignored once another window has taken the tutor over. */
  update(window: TutorWindow, change: Partial<Omit<LineContext, 'moment'>>): void {
    if (!this.context || this.window !== window) return
    // A free conversation only keeps the conversation and Explore; the rest is about a line.
    this.context =
      'moment' in this.context
        ? { ...this.context, ...change }
        : { ...this.context, conversation: change.conversation ?? this.context.conversation, exploreEnabled: change.exploreEnabled ?? this.context.exploreEnabled }
  }

  /** The tutor as `window`'s thread (thread.ts) uses it. When another window has taken the tutor over
   * since, the thread's next message opens it again for `window`, on `context()` and the thread so far. */
  forWindow(window: TutorWindow, context: () => TutorContext): ThreadTutor {
    let conversation: ChatMessage[] = []
    const claim = (): void => {
      if (this.window !== window) this.open({ ...context(), conversation }, window)
    }
    return {
      update: (change) => {
        conversation = change.conversation
        this.update(window, change)
      },
      reply: (message) => {
        claim()
        return this.reply(message)
      },
      claim
    }
  }

  /** Duet's text reply to the learner's message. Writing counts as the learner's turn. */
  reply(message: string): Promise<TextReply> {
    const context = this.requireContext()
    this.noteLearnerTurn(message)
    return replyInText({ ...context, exploreEnabled: this.exploreEnabled }, message, async (name, args) => (await this.executeTool({ callId: randomUUID(), name, arguments: args })).output)
  }

  /** Duet's server ended the call (a cap reached): the window ends voice and shows `sentence`. */
  stopVoice(sentence: string): void {
    this.window?.send('tutor:voice-stop', sentence)
  }

  private reset(): void {
    // A conversation over (its window closed) ends its call's minutes too.
    this.voiceRun++
    this.minutes?.ended()
    this.context = undefined
    this.window = undefined
    this.exploreEnabled = false
    this.pending.clear()
    this.practice.open()
    this.lastAction = undefined
    this.cards.resetTutorReview()
    this.player.release('tutor')
  }

  private isTutor(sender: WebContents): boolean {
    return !!this.window?.owns(sender)
  }

  private assertTutor(event: { sender: WebContents }): void {
    if (!this.isTutor(event.sender)) throw new Error('UNTRUSTED_TUTOR_CALLER')
  }

  private requireContext(): TutorContext {
    if (!this.context) throw new Error('MOMENT_NOT_FOUND')
    return this.context
  }

  private send(channel: string, value: unknown): void {
    this.window?.send(channel, value)
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
          const context = this.requireContext()
          if (!('moment' in context)) return this.output({ freeConversation: true, language: context.language, note: 'No video line: this is a free conversation.' })
          const { moment } = context
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
          const about = this.requireContext()
          // A free conversation has no video line: its cards come from Duet.
          const moment = 'moment' in about ? about.moment : undefined
          const draft: CardDraft = {
            type: 'understand',
            expression: string(args.expression, 'expression', 500),
            meaning: string(args.meaning, 'meaning', 800),
            target: string(args.target, 'target', 500),
            situation: context.length ? context.join('\n') : undefined,
            language: contextLanguage(about),
            source: sourceKind === 'video' && moment ? { kind: 'video', moment } : { kind: 'tutor' }
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
        case 'get_practice_words':
          return this.output({ words: this.practice.offer(contextLanguage(this.requireContext())) })
        case 'record_word_use': {
          if (typeof args.correct !== 'boolean') throw new Error('INVALID_CORRECT')
          const language = contextLanguage(this.requireContext())
          this.practice.record(language, string(args.word, 'word', 100), string(args.sentence, 'sentence', 500), args.correct)
          return this.output({ status: 'recorded' })
        }
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
      message: `Review saved: ${rating[0].toUpperCase()}${rating.slice(1)}.`,
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
