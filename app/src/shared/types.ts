export type CardType = 'understand' | 'use'
export type SourceType = 'video' | 'tutor'
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface Moment {
  id: string
  revision: number
  japanese: string
  reading?: string
  precedingContext: string[]
  sourceType: SourceType
  videoUrl?: string
  videoTitle?: string
  timestamp?: number
  cueId?: string
  captionProvenance: 'manual' | 'auto' | 'fixture'
  timingQuality: 'exact' | 'approximate'
}

export interface Explanation {
  id: string
  momentId: string
  momentRevision: number
  meaning: string
  notice?: string
  why?: string
  alternative?: string
  limitation?: string
  provenance: 'reviewed-demo' | 'generated' | 'dictionary'
  version: string
}

export interface DuetCard {
  id: string
  expression: string
  reading?: string
  meaning: string
  target: string
  context: string
  alternative?: string
  consequence?: string
  cardType: CardType
  sourceType: SourceType
  videoUrl?: string
  videoTitle?: string
  sourceTimestamp?: number
  note?: string
  provenance: string
  createdAt: string
  updatedAt: string
  paused: boolean
  revision: number
  scheduler: FsrsCardState
  latestReview?: ReviewEventSummary
}

export interface FsrsCardState {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: number
  last_review?: string
}

export interface ReviewEventSummary {
  id: string
  rating: ReviewRating
  reviewedAt: string
  undone: boolean
}

export interface ReviewCounts {
  dueNow: number
  laterToday: number
  newCards: number
}

export interface ReviewPreview {
  rating: ReviewRating
  due: string
  intervalLabel: string
}

export interface ReviewQueue {
  cards: DuetCard[]
  counts: ReviewCounts
}

export interface AppSettings {
  readingAids: 'kana' | 'romaji' | 'off'
  textScale: 'default' | 'large'
  newCardAllowance: number
  desiredRetention: number
  explanationLanguage: 'english' | 'japanese' | 'balanced'
}

export interface SaveCardInput {
  expression: string
  reading?: string
  meaning: string
  target: string
  context: string
  alternative?: string
  consequence?: string
  cardType: CardType
  sourceType: SourceType
  videoUrl?: string
  videoTitle?: string
  sourceTimestamp?: number
  note?: string
  provenance: string
}

export interface UpdateCardInput extends Partial<SaveCardInput> {
  id: string
  expectedRevision: number
  paused?: boolean
}

export interface ReviewInput {
  cardId: string
  expectedRevision: number
  eventId: string
  rating: ReviewRating
}

export interface TutorTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface TutorReply {
  text: string
  provenance: 'reviewed-demo' | 'generated'
}

export interface PronunciationResult {
  status: 'acceptable' | 'issue' | 'unsuitable' | 'unsupported'
  property?: string
  feedback: string
  nextAction: string
}

export interface DuetApi {
  explain(moment: Moment): Promise<Explanation>
  tutor(moment: Moment, turns: TutorTurn[]): Promise<TutorReply>
  assessPronunciation(moment: Moment, audio: ArrayBuffer): Promise<PronunciationResult>
  listCards(): Promise<DuetCard[]>
  createCard(input: SaveCardInput): Promise<DuetCard>
  updateCard(input: UpdateCardInput): Promise<DuetCard>
  deleteCard(id: string): Promise<void>
  getReviewQueue(): Promise<ReviewQueue>
  previewReview(cardId: string): Promise<ReviewPreview[]>
  reviewCard(input: ReviewInput): Promise<DuetCard>
  undoLatestReview(cardId: string): Promise<DuetCard>
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<AppSettings>
  exportBackup(): Promise<string>
  importBackup(payload: string): Promise<void>
  clearAllData(): Promise<void>
}
