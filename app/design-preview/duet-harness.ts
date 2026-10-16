// Preview only: mounts the new mascot's engine outside the app, to check it in a browser.
import '../src/renderer/src/components/duet/duet.css'
import {
  createDuet,
  type DuetMood,
  type DuetGesture
} from '../src/renderer/src/components/duet/engine'
import { ConversationDirector } from '../src/renderer/src/components/duet/conversation'

const small = createDuet(document.getElementById('small') as unknown as SVGSVGElement, {}, 'asleep')
const big = createDuet(document.getElementById('big') as unknown as SVGSVGElement, {}, 'asleep')
const both = [small, big]
;(window as unknown as { duets: typeof both }).duets = both

// As in the talk bubble: wake on open, then think while connecting, then listen.
setTimeout(() => both.forEach((d) => void d.wake().then(() => d.setState('thinking'))), 600)

const moods: DuetMood[] = [
  'asleep',
  'idle',
  'listening',
  'thinking',
  'speaking',
  'correct',
  'amazed',
  'proud',
  'almost',
  'oops',
  'encourage',
  'surprised',
  'confused',
  'curious',
  'laughing',
  'shy',
  'sleepy',
  'sad',
  'adoring',
  'determined'
]
const controls = document.getElementById('controls')!
for (const mood of moods) {
  const b = document.createElement('button')
  b.textContent = mood
  b.onclick = () =>
    both.forEach((d) =>
      mood === 'asleep' ? d.setState('asleep') : void d.wake().then(() => d.setState(mood))
    )
  controls.append(b)
}

for (const gesture of [
  'nod',
  'mmhm',
  'yes',
  'no',
  'wave',
  'wink',
  'yawn',
  'giggle'
] as DuetGesture[]) {
  const button = document.createElement('button')
  button.textContent = `Gesture: ${gesture}`
  button.onclick = () => both.forEach((d) => d.gesture(gesture))
  controls.append(button)
}
const caption = document.createElement('p')
caption.style.textAlign = 'center'
controls.after(caption)
const director = new ConversationDirector()
let sequence = 0
let scriptTimer: ReturnType<typeof setTimeout> | undefined
const scenarios: [string, 'learner' | 'tutor'][] = [
  ['Hello!', 'tutor'],
  ['Tell me more?', 'tutor'],
  ['Wow!', 'learner'],
  ["I'm not sure what you mean.", 'tutor'],
  ['Not quite, try again.', 'tutor'],
  ["Don't give up!", 'tutor'],
  ["Let's try again.", 'learner'],
  ['Well done!', 'tutor'],
  ["I'm proud of you.", 'tutor'],
  ['That was incredible!', 'tutor'],
  ['My mistake.', 'tutor'],
  ["You're so cute, Duet.", 'learner'],
  ['I appreciate you.', 'learner'],
  ["That's hilarious!", 'learner'],
  ['Just kidding.', 'tutor'],
  ['Hehe.', 'tutor'],
  ['Yes, I agree.', 'tutor'],
  ['No, not exactly.', 'tutor'],
  ['I feel really sad.', 'learner'],
  ['Goodbye!', 'tutor']
]
const run = document.createElement('button')
run.textContent = 'Play conversation / stop'
run.onclick = (): void => {
  if (scriptTimer) {
    clearTimeout(scriptTimer)
    scriptTimer = undefined
    return
  }
  let index = 0
  const step = (): void => {
    const example = scenarios[index++]
    if (!example) {
      both.forEach((d) => {
        d.setOptions({ speaking: false })
        d.setState('sleepy')
      })
      scriptTimer = setTimeout(() => {
        both.forEach((d) => d.setState('asleep'))
        scriptTimer = undefined
      }, 3000)
      return
    }
    const [text, role] = example
    director.reset()
    const now = performance.now()
    director.read({ id: String(++sequence), role, text, complete: true }, now)
    const cue = director.cue
    caption.textContent = `${role}: ${text} → ${cue?.mood ?? cue?.gesture ?? 'attentive'}`
    both.forEach((d) => {
      d.setOptions({ speaking: role === 'tutor' })
      d.setState(cue?.mood ?? (role === 'tutor' ? 'speaking' : 'listening'), { tone: cue?.tone })
      if (cue?.gesture) d.gesture(cue.gesture)
    })
    scriptTimer = setTimeout(step, 3200)
  }
  step()
}
controls.append(run)
const speech = document.createElement('button')
let speaking = false
speech.textContent = 'Toggle speech over emotion'
speech.onclick = (): void => {
  speaking = !speaking
  both.forEach((d) => d.setOptions({ speaking }))
}
controls.append(speech)
window.addEventListener('pagehide', () => {
  clearTimeout(scriptTimer)
  both.forEach((d) => d.destroy())
})
