// The flashcards page's bridge to the main process (src/main/flashcards): Review, Words, Collections.
import type { Card } from '../shared/cards'
import type {
  AnswerSignals,
  CollectionView,
  DictEntry,
  FlashcardsPrefs,
  PictureSource,
  SessionScope,
  SessionState,
  SpokenCheck,
  TodayView,
  VideoGroup,
  WordView
} from '../shared/flashcards'
import type { Language } from '../shared/types'
import { invoke } from './invoke'

type Clip = { data: Uint8Array; mimeType: string }

export const flashcardsApi = {
  prefs: () => invoke<FlashcardsPrefs>('flashcards:prefs'),
  setPrefs: (change: Partial<FlashcardsPrefs>) =>
    invoke<FlashcardsPrefs>('flashcards:set-prefs', change),
  today: (language: Language) => invoke<TodayView>('flashcards:today', language),

  start: (scope: SessionScope) => invoke<SessionState>('flashcards:start', scope),
  answer: (cardId: string, signals: AnswerSignals) =>
    invoke<SessionState>('flashcards:answer', cardId, signals),
  undo: () => invoke<SessionState>('flashcards:undo'),
  state: () => invoke<SessionState>('flashcards:state'),

  /** Duet reading the card's word, or the line it shows. */
  speak: (cardId: string, what: 'word' | 'line') => invoke<Clip>('flashcards:speak', cardId, what),
  checkSpoken: (cardId: string, clip: Clip) =>
    invoke<SpokenCheck>('flashcards:check-spoken', cardId, clip),
  checkTyped: (cardId: string, answer: string) =>
    invoke<SpokenCheck>('flashcards:check-typed', cardId, answer),
  /** A use-it card's sentence: typed, or a recording. */
  checkUse: (cardId: string, answer: string | Clip) =>
    invoke<SpokenCheck>('flashcards:check-use', cardId, answer),
  /** Plays the word where it was last heard; false when there's no video to play. */
  replay: (language: Language, key: string) => invoke<boolean>('flashcards:replay', language, key),

  word: (language: Language, key: string) => invoke<WordView>('flashcards:word', language, key),
  setSooner: (language: Language, key: string, on: boolean) =>
    invoke<WordView>('flashcards:sooner', language, key, on),
  setPaused: (language: Language, key: string, paused: boolean) =>
    invoke<WordView>('flashcards:pause', language, key, paused),

  collections: () => invoke<CollectionView[]>('flashcards:collections'),
  videos: (language: Language) => invoke<VideoGroup[]>('flashcards:videos', language),

  lookup: (language: Language, word: string) =>
    invoke<{ meaning?: string; entry?: DictEntry }>('flashcards:lookup', language, word),
  make: (draft: { language: Language; word: string; meaning?: string; line?: string }) =>
    invoke<Card>('flashcards:make', draft),
  picture: (cardId: string, from: PictureSource) =>
    invoke<string | undefined>('flashcards:picture', cardId, from)
}
