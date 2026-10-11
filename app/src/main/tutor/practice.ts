// Practice words in a conversation with Duet (the knowledge ladder): Talk is given words the learner
// can say but hasn't used yet (get_practice_words), and may record that the learner used one
// (record_word_use) only
//   - for a word it was given this conversation,
//   - in a sentence the learner said or wrote this conversation (checked against what was heard,
//     spaces and punctuation aside), and
//   - once per word per learner turn,
// so a model can't pile up evidence on its own. Errors are the tool's codes (index.ts TOOL_ERRORS).
import type { Language } from '../../shared/types'
import type { Knowledge } from '../knowledge'

// Of what the learner said or wrote this conversation, the last this many characters are kept.
const HEARD_CHARS = 4_000

/** Text as compared: one form of each character, lower case, no spaces or punctuation (speech
 * recognition and the model write those differently). */
const plain = (text: string): string => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

export class PracticeWords {
  // Learner turns so far, and how many there were when this conversation opened.
  private turns = 0
  private openedTurn = 0
  // What the learner said or wrote this conversation, as compared.
  private heard = ''
  // The words given this conversation (dictionary form → key), and the turn each was last recorded in.
  private readonly offered = new Map<string, string>()
  private readonly usedIn = new Map<string, number>()

  constructor(private readonly knowledge?: Pick<Knowledge, 'practiceWords' | 'noteAttempt'>) {}

  /** A new conversation (or none): nothing given or heard yet. */
  open(): void {
    this.offered.clear()
    this.usedIn.clear()
    this.heard = ''
    this.openedTurn = this.turns
  }

  /** The learner began a turn (spoke or wrote); `text` is what they said, or its first piece. */
  learnerTurn(text?: string): void {
    this.turns++
    if (text) this.hear(text)
  }

  /** More of the turn the learner is in, as voice hears it. */
  hear(text: string): void {
    this.heard = (this.heard + plain(text)).slice(-HEARD_CHARS)
  }

  /** The words for Duet to weave in. */
  offer(language: Language): { word: string; seenAs: string }[] {
    const words = this.knowledge?.practiceWords(language) ?? []
    for (const word of words) this.offered.set(word.word, word.key)
    return words.map(({ word, seenAs }) => ({ word, seenAs }))
  }

  /** The learner used a practice word in `sentence`, well (`correct`) or not. */
  record(language: Language, word: string, sentence: string, correct: boolean): void {
    const key = this.offered.get(word)
    if (!key) throw new Error('WORD_NOT_OFFERED')
    if (this.turns === this.openedTurn || this.usedIn.get(key) === this.turns) throw new Error('LEARNER_TURN_REQUIRED')
    const said = plain(sentence)
    if (!said || !this.heard.includes(said)) throw new Error('SENTENCE_NOT_HEARD')
    this.usedIn.set(key, this.turns)
    this.knowledge?.noteAttempt(language, key, 'use', correct, sentence)
  }
}
