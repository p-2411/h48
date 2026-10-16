import assert from 'node:assert/strict'
import {
  classifyReaction,
  ClauseBuffer,
  ConversationDirector,
  ListeningActivity,
  VoiceMood,
  similarity
} from '../src/renderer/src/components/duet/conversation.ts'

const turn = (text, role = 'tutor', id = 'a') => ({ id, role, text, complete: true })
const examples = [
  ['My mistake.', 'oops'],
  ['Not quite, try again.', 'almost'],
  ['I feel really sad.', 'sad'],
  ["Don't give up!", 'encourage'],
  ['That was incredible!', 'amazed'],
  ["I'm proud of you.", 'proud'],
  ["That's correct!", 'correct'],
  ["I'm not sure what you mean.", 'confused'],
  ["You're so cute, Duet.", 'shy', 'learner'],
  ['I appreciate you.', 'adoring'],
  ["That's hilarious!", 'laughing'],
  ['Wow!', 'surprised'],
  ["Let's try again.", 'determined'],
  ['Tell me more.', 'curious'],
  ['Es correcto.', 'correct'],
  ['正解です。', 'correct'],
  ['잘했어요!', 'correct'],
  ['Me siento triste.', 'sad', 'learner'],
  ['びっくりしました。', 'surprised'],
  ['다시 해볼게요.', 'determined', 'learner']
]
for (const [text, mood, role] of examples)
  assert.equal(classifyReaction(turn(text, role))?.mood, mood, text)

// How the tutor and learner actually talk, not one wording per feeling.
for (const [text, mood, role] of [
  ['Great job!', 'correct'],
  ['¡Muy bien!', 'correct'],
  ['¡Perfecto!', 'correct'],
  ['完璧です！', 'correct'],
  ['완벽해요!', 'correct'],
  ['So close! It should be "estoy".', 'almost'],
  ['Casi, pero no.', 'almost'],
  ['Incredible!', 'amazed'],
  ['This is so hard.', 'encourage', 'learner'],
  ['No entiendo.', 'encourage', 'learner'],
  ['Thanks so much!', 'adoring', 'learner'],
  ['lol', 'laughing', 'learner'],
  ['ㅋㅋㅋ', 'laughing', 'learner'],
  ['Really?', 'surprised', 'learner']
])
  assert.equal(classifyReaction(turn(text, role))?.mood, mood, text)
// Everyday lesson talk that must not be read as a feeling.
for (const text of ['The correct form is “fui”.', 'Casi siempre como en casa.', 'En español se dice hola.', 'Vamos a ver.'])
  assert.equal(classifyReaction(turn(text))?.mood, undefined, text)
assert.equal(classifyReaction(turn('Now listen to this one!'))?.tone, 'excited', 'An exclaimed line gets the excited face')

{
  // The tutor ends most turns with a question: curious now and then, not every turn.
  const d = new ConversationDirector()
  d.read(turn('¿Qué hiciste ayer?', 'tutor', 'q1'), 0)
  assert.equal(d.cue?.mood, 'curious')
  d.tick(5000)
  d.read(turn('¿Y después?', 'tutor', 'q2'), 10_000)
  assert.equal(d.cue, undefined, 'Tutor questions have a long cooldown')
  // A mention of "the word" in one clause does not silence the rest of the reply.
  d.reset()
  d.read(turn('The word for sad is triste. That was incredible!', 'tutor', 'w1'), 0)
  assert.equal(d.cue?.mood, 'amazed')
}
for (const [text, gesture] of [
  ['Hello!', 'wave'],
  ['Just kidding.', 'wink'],
  ['Hehe.', 'giggle'],
  ['Yes, I agree.', 'yes'],
  ['No, not exactly.', 'no']
]) {
  assert.equal(classifyReaction(turn(text))?.gesture, gesture, text)
}
for (const text of [
  'Not well done.',
  'Translate “I feel sad.”',
  'How do you say wow?',
  'The word “cute” means adorable.',
  '“Wow! That was incredible!”',
  '「正解です。」',
  "'That was incredible!'",
  'We watched a movie yesterday.'
]) {
  assert.equal(classifyReaction(turn(text)), undefined, text)
}
assert.equal(
  classifyReaction(turn("That's correct!", 'learner')),
  undefined,
  'Learner assertions do not grade themselves'
)

const buffer = new ClauseBuffer()
assert.deepEqual(buffer.read({ ...turn('That was incre'), complete: false }, 0), [])
assert.equal(
  buffer.read({ ...turn('That was incredible!'), complete: false }, 150)[0].text,
  'That was incredible!'
)
assert.deepEqual(buffer.read(turn('That was incredible!'), 300), [])
buffer.reset()
assert.deepEqual(buffer.read({ ...turn('“Wow!'), complete: false }, 0), [])
assert.deepEqual(
  buffer.read({ ...turn('“Wow!'), complete: false }, 700),
  [],
  'Unclosed quotes do not leak reactions'
)
assert.equal(classifyReaction(buffer.read(turn('“Wow!”'), 850)[0]), undefined)
buffer.reset()
assert.deepEqual(buffer.read({ ...turn('Hello'), complete: false }, 0), [])
assert.equal(buffer.read({ ...turn('Hello'), complete: false }, 600)[0].text, 'Hello')

const director = new ConversationDirector()
director.read(turn('Well done!'), 0)
assert.equal(director.cue?.mood, 'correct')
const first = director.cue.id
director.read(turn('Well done!'), 150)
assert.equal(director.cue.id, first, 'Repeated renders do not replay the cue')
director.offer({ mood: 'almost', priority: 10 }, 200)
assert.equal(director.cue.mood, 'almost', 'Explicit correction beats a text guess')
director.offer({ gesture: 'nod', priority: 1 }, 300)
assert.equal(director.cue.mood, 'almost', 'Listening gestures do not displace emotions')
director.tick(3000)
assert.equal(director.cue, undefined)
director.offer({ mood: 'almost', priority: 10 }, 3100)
assert.equal(director.cue, undefined, 'Duplicate cooldown lasts four seconds')
director.offer({ mood: 'almost', priority: 10 }, 4300)
assert.equal(director.cue.mood, 'almost')
director.read(turn('I have a question.', 'learner', 'b'), 4400)
assert.equal(director.cue, undefined, 'Interruption clears the previous tutor reaction')
director.reset()
director.read(turn('Translate this into English.', 'learner', 'c'), 4500)
director.read(turn('I feel really sad.', 'tutor', 'd'), 4700)
assert.equal(director.cue, undefined, 'Previous turn gives translation context')
director.reset()
director.offer({ mood: 'correct', priority: 10 }, 4800)
assert.ok(director.cue.id > first, 'Cue ids remain unique across session resets')
director.reset()
assert.equal(director.cue, undefined, 'Session reset removes stale reactions')

let now = 0
const activity = new ListeningActivity()
function sample(ms, rms, modulate = false) {
  const events = []
  for (let i = 0; i < ms; i += 34) {
    now += 34
    events.push(activity.sample(modulate ? rms * (i % 102 === 0 ? 0.55 : 1) : rms, now))
  }
  return events
}
assert.ok(
  sample(1500, 0).every((e) => !e.started && !e.backchannel),
  'Silence never acknowledges'
)
assert.ok(
  sample(2000, 0.012).every((e) => !e.backchannel),
  'Quiet noise never acknowledges'
)
sample(500, 0.09, true)
assert.ok(
  sample(450, 0).every((e) => !e.backchannel),
  'Short sounds do not acknowledge'
)
sample(1200, 0.09, true)
assert.equal(
  sample(500, 0).filter((e) => e.backchannel).length,
  1,
  'One nod after a sustained phrase'
)
sample(1000, 0.09, true)
assert.equal(sample(500, 0).filter((e) => e.backchannel).length, 0, 'Three-second spacing')
activity.reset() // Same reset as mute/disconnect/hidden.
assert.ok(
  sample(1500, 0).every((e) => !e.backchannel),
  'Mute discards the unfinished phrase'
)
sample(1200, 0.09, true)
activity.reset()
assert.ok(
  sample(500, 0).every((e) => !e.backchannel),
  'No late nod after session release'
)
console.log(
  'Mascot conversation: rules, streaming, priorities, interruption, and listening activity passed.'
)

activity.reset()
assert.ok(
  sample(9000, 0.06).every((e) => !e.started && !e.backchannel),
  'Steady loud noise is not speech'
)
assert.ok(sample(500, 0).every((e) => !e.backchannel))

// How the learner sounds, read on-device (no API): simulated microphone levels, 34 ms apart.
{
  let t = 0
  const drive = (voice, levels, listening = true) => {
    const out = []
    for (const rms of levels) {
      t += 34
      const r = voice.sample(rms, t, listening)
      if (r) out.push(r.mood)
    }
    return out
  }
  const quiet = (ms) => Array(Math.round(ms / 34)).fill(0.002)
  const steady = (ms, rms) => Array.from({ length: Math.round(ms / 34) }, (_, i) => rms * (0.8 + 0.4 * Math.abs(Math.sin(i * 1.7))))
  // Speech-like: syllables at uneven spacing, never dropping to silence in between.
  const speech = (ms, rms) => Array.from({ length: Math.round(ms / 34) }, (_, i) => rms * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.9 + Math.sin(i * 0.37) * 2))))
  // "Ha-ha-ha": short even bursts with near-silence between.
  const laugh = (n) => Array.from({ length: n }, () => [0.12, 0.12, 0.002, 0.002, 0.002, 0.002]).flat()

  let v = new VoiceMood()
  assert.deepEqual(drive(v, [...quiet(1000), ...speech(6000, 0.06), ...quiet(600)]), [], 'Ordinary speech is not a feeling')
  assert.ok(drive(v, laugh(7)).includes('laughing'), 'Even, quick bursts are laughter')
  assert.deepEqual(drive(v, laugh(7)), [], 'Then not again for a while')

  v = new VoiceMood()
  drive(v, [...quiet(800), ...speech(4500, 0.05), ...quiet(1200)])
  assert.ok(drive(v, speech(300, 0.3)).includes('surprised'), 'A sudden exclamation, far louder than usual')

  v = new VoiceMood()
  drive(v, [...quiet(800), ...speech(4500, 0.05)])
  assert.ok(drive(v, speech(1800, 0.1)).includes('curious'), 'Speaking animatedly: Duet leans in')

  v = new VoiceMood()
  drive(v, quiet(800))
  const halting = [...steady(400, 0.05), ...quiet(800), ...steady(300, 0.05), ...quiet(900), ...steady(400, 0.05), ...quiet(800), ...steady(300, 0.05), ...quiet(1100)]
  assert.ok(drive(v, halting).includes('encourage'), 'A halting turn gets encouragement')
  assert.deepEqual(drive(new VoiceMood(), halting, false), [], 'Only while Duet listens')

  v = new VoiceMood()
  drive(v, quiet(500))
  v.waiting(t)
  assert.deepEqual(drive(v, quiet(5000)), [], 'A short wait is fine')
  assert.ok(drive(v, quiet(2500)).includes('encourage'), 'A long silence after Duet asked')

  // Trying the same phrase again (any script), from the transcript.
  assert.ok(similarity('Una paella muy rica.', 'una paella muy rico') > 0.8)
  assert.ok(similarity('Fui a la playa.', 'Me gusta el café.') < 0.4)
  assert.ok(similarity('いただきます', 'いただきます！') > 0.9)
  const d = new ConversationDirector()
  d.read(turn('Comí un paella muy rico.', 'learner', 'l1'), 0)
  d.read(turn('Close! Una paella muy rica.', 'tutor', 't1'), 1000)
  d.tick(9000)
  d.read(turn('Una paella muy rica.', 'learner', 'l2'), 9000)
  d.read(turn('Better.', 'tutor', 't2'), 10_000)
  assert.equal(d.cue?.mood, 'determined', 'Another go at the same phrase')
  console.log('Mascot voice reading (laughter, surprise, animation, hesitation, silence, retries) passed.')
}
