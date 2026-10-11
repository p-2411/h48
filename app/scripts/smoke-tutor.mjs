// A dependency-light smoke test for the pinned FSRS package and voice-tutor contracts.
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { backendInstructions, lineContext, liveInstructions, textInstructions } from '../src/main/tutor/prompts.ts'
import { ENGLISH_HELP_DELAY_MS, LIVE_REPLY_FALLBACK_MS } from '../src/renderer/src/tutor/timing.ts'
import { LANGUAGE_CODES, languageModule, speaks } from '../src/shared/languages/index.ts'
import { joinTokens } from '../src/shared/levels.ts'

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

// Text and voice get the same line context: the line, how it was said, the explanation and the
// conversation so far.
const context = lineContext({
  moment: {
    language: 'ja',
    line: { id: 1, original: 'そんなつもりじゃなかった。', at: now, state: 'pending' },
    earlier: [{ original: '怒ってるの？', translation: 'Are you angry?' }],
    video: { site: 'youtube', url: 'fixture:tutor-smoke', position: 42 },
    takenAt: now
  },
  delivery: { description: 'Flat and defensive, a little hurt.', spokenLanguage: 'Japanese' },
  explanation: { meaning: 'A defensive denial.', card: { expression: '', meaning: '', target: '', situation: '' }, model: 'test', version: 1 },
  conversation: [{ from: 'learner', text: 'Is this rude?' }]
})
for (const [what, text] of [['line', 'そんなつもりじゃなかった。'], ['tone', 'Flat and defensive'], ['explanation', 'A defensive denial.'], ['conversation', 'Is this rude?']])
  if (!context.includes(text)) throw new Error(`The line context is missing the ${what}.`)
// Every language gets the whole teaching policy, with its own speech and correction sections.
for (const language of LANGUAGE_CODES) {
  const { name, tutor } = languageModule(language)
  const live = liveInstructions(language)
  const backend = backendInstructions(language)
  if (live.includes('${') || backend.includes('${'))
    throw new Error(`${name}: a prompt has an unfilled placeholder.`)
  if (!live.includes('free recall'))
    throw new Error(`${name}: the live tutor no longer asks for recall before revealing a card.`)
  if (!backend.includes('explicit confirmation'))
    throw new Error(`${name}: the backend prompt no longer requires confirmation for card writes.`)
  if (!live.includes(`every ${name} utterance`))
    throw new Error(`${name}: Duet no longer treats each learner turn as a practice attempt.`)
  if (!live.includes('respond in English first'))
    throw new Error(`${name}: Duet no longer puts English before a correction model.`)
  if (!live.includes('Never silently consume a turn'))
    throw new Error(`${name}: Duet no longer answers each completed learner turn.`)
  if (!live.includes('roughly 80%') || !tutor.speech.every((line) => live.includes(line)))
    throw new Error(`${name}: the speech policy is missing its slower pace or its own pronunciation lines.`)
  if (!tutor.delivery.length || !tutor.delivery.every((line) => live.includes(line)))
    throw new Error(`${name}: the voice prompt is missing what to listen for in the learner's delivery.`)
  if (!tutor.corrections.every((line) => live.includes(line) && backend.includes(line)))
    throw new Error(`${name}: the prompts are missing its correction focus.`)
  const text = textInstructions(language)
  if (text.includes('${') || !tutor.corrections.every((line) => text.includes(line)) || !text.includes('explicit confirmation'))
    throw new Error(`${name}: the text conversation's prompt is missing its corrections or its card rules.`)
  if (!backend.includes('only after the learner opens their saved cards to Duet (the Use my cards button)'))
    throw new Error(`${name}: saved learning history is no longer gated behind Use my cards.`)
  const others = LANGUAGE_CODES.filter((code) => code !== language)
  if (others.some((code) => live.includes(languageModule(code).name)))
    throw new Error(`${name}: its prompt names another language.`)
}

// The Meaning button shows for turns in the language, not for English ones.
for (const language of LANGUAGE_CODES) {
  const sample = joinTokens(languageModule(language).sample.source)
  if (!speaks(language, sample) || speaks(language, 'Hello, how are you doing today?'))
    throw new Error(`${languageModule(language).name} reveal detection is not working.`)
}
if (ENGLISH_HELP_DELAY_MS < 5_000 || ENGLISH_HELP_DELAY_MS > 15_000)
  throw new Error('The automatic English-help delay is outside the learner-friendly range.')
if (LIVE_REPLY_FALLBACK_MS < 1_000 || LIVE_REPLY_FALLBACK_MS > 3_000)
  throw new Error('The stalled-turn fallback is outside the conversational latency range.')

const tutorMain = readFileSync(resolve(import.meta.dirname, '../src/main/tutor/index.ts'), 'utf8')
if (!tutorMain.includes("if (!this.exploreEnabled) throw new Error('EXPLORE_REQUIRED')"))
  throw new Error(
    'The trusted app process no longer blocks saved-history tools before Use my cards.'
  )
// Voice reads "Use my cards" from the context it starts with, as text does with each message.
if (!tutorMain.includes('createLiveSession(offer.sdp, { ...this.context, exploreEnabled: this.exploreEnabled })'))
  throw new Error('Voice no longer learns that the learner opened their saved cards to Duet.')
if (!lineContext({ moment: { language: 'ja', line: { id: 1, original: 'x', at: now, state: 'pending' }, earlier: [], video: { site: 'youtube', url: 'fixture:x' }, takenAt: now }, exploreEnabled: true }).includes('savedCardsOpenToDuet'))
  throw new Error('The line context no longer says the saved cards are open to Duet.')

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
