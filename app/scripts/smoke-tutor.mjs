// A dependency-light smoke test for the pinned FSRS package and voice-tutor contracts.
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BACKEND_INSTRUCTIONS,
  LIVE_INSTRUCTIONS,
  momentContext
} from '../src/main/tutor/prompts.ts'
import {
  containsJapanese,
  ENGLISH_HELP_DELAY_MS,
  LIVE_REPLY_FALLBACK_MS
} from '../src/renderer/src/tutor/language.ts'

const now = Date.now()
const outcomes = fsrs({ request_retention: 0.9 }).repeat(
  createEmptyCard(new Date(now)),
  new Date(now)
)

for (const [rating, grade] of Object.entries({
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy
})) {
  const outcome = outcomes[grade]
  if (!outcome || Number.isNaN(outcome.card.due.getTime()))
    throw new Error(`Missing a valid FSRS outcome for ${rating}.`)
}

const context = momentContext({
  language: 'ja',
  line: { id: 1, original: 'そんなつもりじゃなかった。', at: now, state: 'pending' },
  earlier: [{ original: '怒ってるの？', translation: 'Are you angry?' }],
  video: { site: 'youtube', url: 'fixture:tutor-smoke', position: 42 },
  takenAt: now
})

if (!context.includes('そんなつもりじゃなかった。'))
  throw new Error('The selected line was not included in the live-session context.')
if (!LIVE_INSTRUCTIONS.includes('free recall'))
  throw new Error('The live tutor no longer asks for recall before revealing a card.')
if (!BACKEND_INSTRUCTIONS.includes('explicit confirmation'))
  throw new Error('The backend prompt no longer requires explicit confirmation for card writes.')
if (!LIVE_INSTRUCTIONS.includes('every Japanese utterance'))
  throw new Error('Duet no longer treats each Japanese learner turn as a practice attempt.')
if (!LIVE_INSTRUCTIONS.includes('respond in English first'))
  throw new Error('Duet no longer puts understandable English before a Japanese correction model.')
if (!LIVE_INSTRUCTIONS.includes('Never silently consume a turn'))
  throw new Error('Duet no longer guarantees a spoken response to each completed learner turn.')
if (!LIVE_INSTRUCTIONS.includes('roughly 80%') || !LIVE_INSTRUCTIONS.includes('mora timing'))
  throw new Error('Duet no longer gives Japanese its slower, pronunciation-specific speech policy.')
if (!BACKEND_INSTRUCTIONS.includes('explicitly enabled Explore further'))
  throw new Error('Saved learning history is no longer gated behind Explore further.')
if (!containsJapanese('こんにちは') || containsJapanese('hello'))
  throw new Error('Japanese reveal detection is not working.')
if (ENGLISH_HELP_DELAY_MS < 5_000 || ENGLISH_HELP_DELAY_MS > 15_000)
  throw new Error('The automatic English-help delay is outside the learner-friendly range.')
if (LIVE_REPLY_FALLBACK_MS < 1_000 || LIVE_REPLY_FALLBACK_MS > 3_000)
  throw new Error('The stalled-turn fallback is outside the conversational latency range.')

const tutorMain = readFileSync(resolve(import.meta.dirname, '../src/main/tutor/index.ts'), 'utf8')
if (!tutorMain.includes("if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')"))
  throw new Error(
    'The trusted app process no longer blocks saved-history tools before Explore further.'
  )

const liveHook = readFileSync(
  resolve(import.meta.dirname, '../src/renderer/src/tutor/useLiveTutor.ts'),
  'utf8'
)
if (
  !liveHook.includes('Reconnecting (${attempt}/3)') ||
  !liveHook.includes('new MediaStream([track])')
)
  throw new Error('Voice reconnection or remote-audio fallback is missing.')

console.log('Tutor prompt and shared FSRS smoke test passed.')
