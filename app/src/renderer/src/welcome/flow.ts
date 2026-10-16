// The first run (design: design-preview/duet-merged). A sectioned window: where the learner is
// across the title bar, Duet's column on the left, a live stage on the right. It opens on Duet
// alone, centred and writing; it talks out loud only once the learner says it may. The stage slides
// in at the language, and one video carries from there: a line in the language, a placement test,
// then a clip where the learner tries the caption strip (a stand-in, strip.ts) and saves a word, a
// scene check, and on macOS the one permission Duet needs. The language and level are saved as they
// are chosen; "Open the Duet app" finishes (window.duet.welcome.done), and the home base opens.
// Replayed from Settings (?replay=1), it's a demo: nothing chosen in it is saved.
import {
  createDuet,
  type DuetEngine,
  type DuetGesture,
  type DuetMood
} from '../components/duet/engine'
import { LANGUAGE_CODES, languageName, type Language } from '../../../shared/languages'
import { joinTokens } from '../../../shared/levels'
import type { Level } from '../../../shared/types'
import { CONTENT, LEVEL_NAMES, type Content, type Item } from './content'
import { keyNames, LINES } from './lines'
import { mountStrip, type SavedWord } from './strip'
import { expectClip, hasClip, playClip, stopVoice, voiceLevel } from './voice'

const mac = navigator.platform.startsWith('Mac')
const replay = new URLSearchParams(location.search).has('replay')
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const state = {
  lang: 'es' as Language,
  sound: false,
  mic: 'ask' as 'ask' | 'yes' | 'no',
  placed: 0,
  shortcut: 'Alt+Shift+D',
  trusted: true
}
const L = (): Content => CONTENT[state.lang]
// Bumped by Skip: whatever was on its way stops, and a question still on its way never shows.
let run = 0
let skipped = false
const never = <T>(): Promise<T> => new Promise<T>(() => undefined)

// ── Duet ────────────────────────────────────────────────────────────────────────────────────────
const svg = $('duet') as unknown as SVGSVGElement
const dark = matchMedia('(prefers-color-scheme: dark)')
const theme = (): 'light' | 'dark' => (dark.matches ? 'dark' : 'light')
// While a recorded clip plays, the mouth follows its loudness; otherwise it keeps its own rhythm.
const duet: DuetEngine = createDuet(
  svg,
  { theme: theme(), watch: 'near', speechLevel: voiceLevel },
  'asleep'
)
dark.addEventListener('change', () => duet.setOptions({ theme: theme() }))
// Duet wakes once, whether the run or Skip gets there first.
let woke: Promise<void> | undefined
const wake = (): Promise<void> => (woke ??= duet.wake())
let feeling: DuetMood = 'idle'
const mood = (m: DuetMood): void => {
  feeling = m
  duet.setState(m)
}
// The faces that carry a feeling into the next line; the rest give way to the line's own feeling.
const FELT: DuetMood[] = [
  'correct',
  'amazed',
  'proud',
  'encourage',
  'adoring',
  'curious',
  'determined',
  'surprised',
  'laughing'
]
/** How Duet looks while saying a line: the feeling it's in, or the line's own. */
function feel(text: string, given?: DuetMood): DuetMood {
  if (given) return given
  if (/[?？]\s*$/u.test(text)) return 'curious'
  if (/[!！]/u.test(text)) return 'amazed'
  return FELT.includes(feeling) ? feeling : 'speaking'
}
const gesture = (g: DuetGesture): void => duet.gesture(g)

// ── What Duet says ───────────────────────────────────────────────────────────────────────────────
// Out loud only once allowed; written either way. Writing goes at a quick reading pace, and each line
// then stays a moment, longer for longer lines, before the next one replaces it.
const WRITE_CPS = { en: 50, native: 18 }
let readyAt = 0
// Lines stay longer where the learner is watching the video, not Duet.
let pace = 1
let lineN = 0
function readMs(text: string, native: boolean): number {
  const ms = native ? 400 + text.length * 55 : 300 + text.split(/\s+/).length * 130
  return Math.min(1800, Math.max(600, ms))
}
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)))
  )
}
const esc = (text: string): string => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

async function say(
  text: string,
  opts: { lang?: string; en?: string; after?: DuetMood; mood?: DuetMood } = {}
): Promise<void> {
  const mine = run
  await wait(Math.max(0, readyAt - Date.now()))
  if (mine !== run) return
  const lang = opts.lang ?? 'en-US'
  const native = !lang.startsWith('en')
  const cap = $('caption')
  if (cap.querySelector('.said')?.textContent) {
    cap.classList.add('leaving')
    await wait(130)
    cap.classList.remove('leaving')
    if (mine !== run) return
  }
  lineN++
  cap.innerHTML = `<span class="said" lang="${lang.slice(0, 2)}"></span>${opts.en ? `<button type="button" class="show-en">Show English</button><span class="en" hidden>${esc(opts.en)}</span>` : ''}`
  cap.classList.toggle('native', native)
  const said = cap.querySelector<HTMLElement>('.said')!
  const showEn = cap.querySelector<HTMLButtonElement>('.show-en')
  if (showEn)
    showEn.onclick = () => {
      showEn.hidden = true
      cap.querySelector<HTMLElement>('.en')!.hidden = false
    }
  const tokens = native && !/\s/.test(text) ? [...text] : text.split(/(\s+)/)
  const spoken = text.replace('{keys}', keyNames(state.shortcut, mac))
  const spans = tokens.map((token) => {
    const s = document.createElement('span')
    s.className = /^\s+$/.test(token) ? 'gap' : 'tok'
    if (token === '{keys}') {
      s.className += ' keys'
      s.innerHTML = keycaps()
    } else s.textContent = token
    said.append(s)
    return s
  })
  let shown = 0
  const reveal = (upTo: number): void => {
    for (; shown < Math.min(upTo, spans.length); shown++) spans[shown].classList.add('on')
  }
  // While it speaks it looks where the line takes it, not at the pointer.
  duet.setOptions({ speaking: true, watch: 'off' })
  mood(feel(text, opts.mood))
  let spoke = false
  // Keys the learner changed weren't recorded: Duet says "these keys" while the keycaps show.
  const recorded = text.includes('{keys}') && !hasClip(lang, spoken) ? LINES.theseKeys : spoken
  expectClip(lang, recorded)
  if (state.sound) {
    // Duet's recorded voice; the words come in as the clip gets to them (by share of the letters).
    const total = tokens.reduce((sum, token) => sum + token.length, 0)
    spoke = await playClip(lang, recorded, (fraction) => {
      let n = 0
      for (let at = 0; n < tokens.length && at <= (fraction + 0.04) * total; n++)
        at += tokens[n].length
      reveal(n)
    })
    if (spoke) reveal(tokens.length)
  }
  if (state.sound && !spoke && mine === run && 'speechSynthesis' in window) {
    // No clip for this line: the system's voice.
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(spoken)
    u.lang = lang
    const v = voiceFor(lang)
    if (v) u.voice = v
    u.rate = native ? 0.95 : 1.05
    u.pitch = 1.15
    spoke = await new Promise<boolean>((resolve) => {
      let started = false
      const fallback = setTimeout(() => !started && resolve(false), 700)
      u.onstart = () => {
        started = true
        clearTimeout(fallback)
      }
      u.onboundary = (e) => {
        let n = 0
        for (let at = 0; n < tokens.length && at <= e.charIndex; n++) at += tokens[n].length
        reveal(n)
      }
      u.onend = () => {
        clearTimeout(fallback)
        resolve(started)
      }
      u.onerror = () => {
        clearTimeout(fallback)
        resolve(false)
      }
      speechSynthesis.speak(u)
    })
    if (spoke) reveal(tokens.length)
  }
  if (!spoke) {
    // Written: the words come in one after another at reading pace, all from one start (CSS does the timing).
    const words = spans.filter((s) => s.classList.contains('tok')).length
    const total = (text.length / (native ? WRITE_CPS.native : WRITE_CPS.en)) * 1000
    const step = total / Math.max(1, words)
    await wait(20)
    let k = 0
    for (const s of spans) {
      if (s.classList.contains('tok')) s.style.transitionDelay = `${Math.round(k++ * step)}ms`
      s.classList.add('on')
    }
    await wait(total)
  }
  if (mine !== run) return
  duet.setOptions({ speaking: false, watch: 'near' })
  mood(opts.after ?? 'listening')
  readyAt = Date.now() + (spoke ? 250 : readMs(text, native)) * pace
}

// ── Answers: pills to tap ────────────────────────────────────────────────────────────────────────
type Chip = { label: string; value: string; sub?: string; quiet?: boolean }
function ask(chips: Chip[]): Promise<string> {
  if (skipped) return never()
  const mine = run
  const box = $('answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    // Picked: the pill holds a beat, the rest fade, then the row goes and Duet answers.
    const done = (v: string, chosen: HTMLElement): void => {
      chosen.classList.add('chosen')
      box.classList.add('choosing')
      box.querySelectorAll('button').forEach((x) => (x.disabled = true))
      setTimeout(() => box.classList.add('gone'), 260)
      setTimeout(() => {
        box.innerHTML = ''
        box.classList.remove('choosing', 'gone')
        if (mine === run) resolve(v)
      }, 440)
    }
    for (const c of chips) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (c.quiet ? ' quiet' : '')
      b.innerHTML = `<span>${esc(c.label)}</span>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}`
      b.onclick = () => {
        readyAt = Date.now() + 250
        done(c.value, b)
      }
      box.append(b)
    }
  })
}

// ── The microphone: asked for just before the first time it's used ──────────────────────────────
const MIC =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
let stream: MediaStream | undefined
async function micAllowed(): Promise<boolean> {
  if (state.mic !== 'ask') return state.mic === 'yes'
  await say(LINES.needMic)
  const yes =
    (await ask([
      { label: 'Allow mic', value: 'yes' },
      { label: 'I’ll skip this', value: 'no', quiet: true }
    ])) === 'yes'
  if (yes) {
    // The system asks the first time (macOS shows its own prompt).
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } })
    } catch {
      stream = undefined
    }
  }
  state.mic = stream ? 'yes' : 'no'
  readyAt = 0
  if (!stream) {
    mood('idle')
    await say(yes ? LINES.noMic : LINES.noProblem)
  }
  return !!stream
}
/** Listens until the learner has said something and stopped (or 7 seconds pass): whether a voice was heard. */
async function heardVoice(): Promise<boolean> {
  if (!stream) return false
  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(stream).connect(analyser)
  const data = new Float32Array(analyser.fftSize)
  let voiced = 0,
    quiet = 0
  const started = Date.now()
  try {
    while (Date.now() - started < 7000) {
      await wait(50)
      analyser.getFloatTimeDomainData(data)
      const rms = Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length)
      if (rms > 0.02) {
        voiced += 50
        quiet = 0
      } else if (voiced) quiet += 50
      if (voiced >= 400 && quiet >= 700) return true
    }
    return voiced >= 400
  } finally {
    void context.close()
  }
}
/** The mic button under Duet: lit while it listens; resolves once a voice was heard. */
function sayIt(): Promise<void> {
  if (skipped) return never()
  const mine = run
  const box = $('answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    const m = document.createElement('button')
    m.type = 'button'
    m.className = 'mic'
    m.innerHTML = MIC + '<span>Say it</span>'
    m.onclick = async () => {
      if (!(await micAllowed())) return
      if (mine !== run) return
      box.innerHTML = ''
      box.append(m)
      box.classList.add('listening')
      $('listen').hidden = false
      mood('listening')
      m.disabled = true
      const heard = await heardVoice()
      box.classList.remove('listening')
      $('listen').hidden = true
      m.disabled = false
      if (mine !== run) return
      if (heard) {
        box.innerHTML = ''
        resolve()
      } else void say(LINES.didntCatch, { after: 'listening' })
    }
    box.append(m)
  })
}

// ── The window: scenes, Duet's place, the intro ─────────────────────────────────────────────────
function scene(name: string): void {
  document
    .querySelectorAll<HTMLElement>('[data-scene]')
    .forEach((s) => s.classList.toggle('on', s.dataset.scene === name))
}
/** Moves Duet to its slot, springing on the way (the CSS transition). */
function dock(): void {
  const box = $('duet-box')
  const slot = $('duet-slot')
  let x = 0,
    y = 0
  for (
    let n: HTMLElement | null = slot;
    n && n.id !== 'win';
    n = n.offsetParent as HTMLElement | null
  ) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  box.style.left = x + 'px'
  box.style.top = y + 'px'
  box.style.width = slot.offsetWidth + 'px'
}
new ResizeObserver(dock).observe($('duet-slot'))
addEventListener('resize', dock)
const intro = (on: boolean): void => {
  $('win').classList.toggle('intro', on)
}

// ── Where the learner is: five dots in the title bar ────────────────────────────────────────────
const CHAPTERS = ['Meet Duet', 'Find your level', 'Watch & learn', 'Scene check', 'All set']
function progress(ch: number, fill: number): void {
  const el = $('chapters')
  el.setAttribute(
    'aria-label',
    `Step ${Math.min(ch + 1, CHAPTERS.length)} of ${CHAPTERS.length}: ${CHAPTERS[Math.min(ch, CHAPTERS.length - 1)]}`
  )
  el.innerHTML = CHAPTERS.map((name, i) => {
    const cls = i === ch ? 'now' : i < ch ? 'done' : ''
    return `<span class="dot-step ${cls}" title="${name}">${i === ch ? `<i style="width:${Math.round(fill * 100)}%"></i>` : ''}</span>`
  }).join('')
}
/** A new section: its name above Duet, and the last section's line fades away rather than carry over. */
function eyebrow(text: string): void {
  const e = $('eyebrow')
  if (e.textContent !== text) clearLine()
  e.textContent = text
}
function clearLine(): void {
  const cap = $('caption')
  if (!cap.querySelector('.said')?.textContent) return
  const n = lineN
  cap.classList.add('leaving')
  setTimeout(() => {
    if (n !== lineN) return
    cap.classList.remove('leaving')
    cap.innerHTML = ''
  }, 200)
}
const vtitle = (html: string): void => {
  $('vtitle').innerHTML = html
}

// ── Try-it list: a tick when done, Skip while it's the one to do ────────────────────────────────
type Task = { id: string; text: string }
const TRY_IT: Task[] = [
  { id: 'light', text: 'Watch your words light up' },
  { id: 'point', text: 'Point at a coloured word' },
  { id: 'save', text: 'Save it as a flashcard' },
  { id: 'say', text: 'Say the line back' }
]
const CHECKS: Task[] = [
  { id: 'glow', text: 'Double-click the glowing line' },
  { id: 'answer', text: 'Answer in your own words' }
]
let TASKS = TRY_IT
let taskSection = 2
const TICK =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M5 12l5 5L20 7"/></svg>'
const done = new Set<string>()
let fresh: string | null = null
function renderTasks(now: string | null): void {
  $('tasks').innerHTML = TASKS.map((t) => {
    const cls =
      (done.has(t.id) ? 'done' : t.id === now ? 'now' : '') + (t.id === fresh ? ' fresh' : '')
    const past =
      cls === 'now' && t.id !== 'light'
        ? `<button type="button" class="past" data-past="${t.id}">Skip</button>`
        : ''
    return `<div class="task ${cls}"><span class="tk">${TICK}</span><span class="grow">${t.text}</span>${past}</div>`
  }).join('')
  progress(taskSection, TASKS.filter((t) => done.has(t.id)).length / TASKS.length)
}
const finishers: Record<string, (how: 'done' | 'skip') => void> = {}
function task(id: string): Promise<'done' | 'skip'> {
  if (skipped) return never()
  renderTasks(id)
  return new Promise((resolve) => {
    finishers[id] = (how) => {
      delete finishers[id]
      if (how === 'done') {
        done.add(id)
        fresh = id
        // Duet takes part: a nod for a step, a proud "yes" when the whole list is done.
        if (TASKS.every((t) => done.has(t.id))) {
          mood('proud')
          gesture('yes')
        } else gesture('nod')
      }
      renderTasks(null)
      fresh = null
      resolve(how)
    }
  })
}
const finish = (id: string, how: 'done' | 'skip' = 'done'): void => finishers[id]?.(how)
$('tasks').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-past]')?.dataset.past
  if (id) {
    $('answers').innerHTML = ''
    readyAt = 0
    finish(id, 'skip')
  }
})

// ── The caption strip on the video ──────────────────────────────────────────────────────────────
// How much of each line is swapped in (the strip's level, 1–5) for each placement result.
const SWAPS_BY_PLACEMENT: Level[] = [1, 2, 3, 4, 5]
const strip = mountStrip($('strip-host'))
// The level circle on the strip is the real setting.
strip.on.level((level) => {
  if (!replay) window.duet.setLevel(level)
})
function line(level: Level, ready = true): void {
  strip.setLanguage(state.lang)
  strip.setLevel(level)
  strip.showLine(ready)
}
function hold(on: boolean): void {
  $('video').classList.toggle('held', on)
  $('vbar-fill').classList.toggle('play', !on)
  const clip = $<HTMLVideoElement>('clip')
  if (on) clip.pause()
  else void clip.play().catch(() => undefined)
}
/** The language's clip on the stage, playing from the start. */
function showClip(): void {
  const clip = $<HTMLVideoElement>('clip')
  clip.src = new URL(`./video/welcome/${L().video}.webm`, document.baseURI).href
  void clip.play().catch(() => undefined)
}
/** The word just saved, as a flashcard: front, then it turns to the back. */
async function showFlashcard(card: SavedWord): Promise<void> {
  $('flash-slot').innerHTML = `<div class="flash" id="flash"><div class="flip">
    <div class="face front"><span class="k">Flashcard</span><b lang="${state.lang}">${esc(card.expression)}</b><span class="where">Front</span></div>
    <div class="face back"><span class="k">Back</span><b>${esc(card.meaning)}</b><i lang="${state.lang}">${esc(joinTokens(strip.sample().source))}</i><span class="where">Duet app › Your words</span></div>
  </div></div>`
  await wait(1300)
  $('flash')?.classList.add('turned')
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────────
async function flow(): Promise<void> {
  const mine = run
  const alive = (): boolean => mine === run
  progress(0, 0)
  intro(true)
  scene('video')
  dock()
  await wait(500)
  await wake()
  if (!alive()) return

  // You. Duet writes first, and asks before it talks.
  gesture('wave')
  await say(LINES.hi, { after: 'idle' })
  await say(LINES.talkOrText, { after: 'curious' })
  const mode = await ask([
    { label: 'Talk out loud', value: 'talk' },
    { label: 'Keep it to text', value: 'text' }
  ])
  if (!alive()) return
  setSound(mode === 'talk')
  mood('correct')
  gesture('nod')
  await say(mode === 'talk' ? LINES.willTalk : LINES.textItIs, { after: 'idle' })

  // Still just Duet, centred: which language. The video slides in once there's a language to show.
  progress(0, 0.5)
  await say(LINES.whichLanguage)
  if (!alive()) return
  const lang = (await ask(
    LANGUAGE_CODES.map((k) => ({ label: languageName(k), sub: CONTENT[k].own, value: k }))
  )) as Language
  if (!alive()) return
  state.lang = lang
  if (!replay) window.duet.setLanguage(lang)
  showClip()
  // The level test comes next, so the stage slides in on it (empty for now); the clip loads behind it
  // and is first seen once the level is found.
  $('test-card').hidden = true
  scene('test')
  line(5)
  vtitle(`<b>Sample clip</b>A line in ${languageName(lang)}`)
  intro(false)
  eyebrow('Meet Duet')
  progress(1, 0)
  mood('amazed')
  await say(L().hello, { lang: L().voice, en: L().helloEn, after: 'adoring' })

  // Your level: an adaptive word test (see placement()), Duet helping in English.
  eyebrow('Find your level')
  const placed = await placement()
  if (!alive()) return
  state.placed = placed
  if (!replay) window.duet.setLevel(SWAPS_BY_PLACEMENT[placed])
  progress(2, 0)
  // Said warmly, whatever it is: a starting point, not a grade.
  mood(placed >= 2 ? 'amazed' : 'adoring')
  gesture(placed >= 2 ? 'yes' : 'nod')
  await say(LINES.rightAbout(placed), { after: placed >= 2 ? 'proud' : 'adoring' })
  await say(LINES.placed(placed), { after: 'idle' })
  scene('video')
  line(SWAPS_BY_PLACEMENT[placed])
  vtitle(`<b>Sample clip</b>Your line, at your level`)
  await wait(1400)

  // Try it.
  eyebrow('Watch & learn')
  await say(LINES.realClip, { after: 'determined' })
  pace = 1.6
  vtitle(`<b>Sample clip</b>${L().scene}<span class="tag">Picked by Duet</span>`)
  line(SWAPS_BY_PLACEMENT[placed], false)
  renderTasks(null)
  $('vbar-fill').classList.remove('play')
  void $('vbar-fill').offsetWidth
  $('vbar-fill').classList.add('play')
  await wait(400)
  if (!alive()) return

  // Your words light up.
  const light = task('light')
  await say(LINES.watchLine)
  hold(true)
  line(SWAPS_BY_PLACEMENT[placed])
  await wait(1000)
  finish('light')
  await light
  mood('proud')
  await say(LINES.colour)
  await say(LINES.tooMuch(lang), { after: 'idle' })

  // Point at a word: the strip's card opens.
  const offWord = strip.on.word(() => finish('point'))
  const point = task('point')
  await say(LINES.pointWord, { after: 'listening' })
  const pointed = await point
  offWord()
  if (!alive()) return
  if (pointed === 'done') {
    mood('curious')
    await say(LINES.meansHere)
  }

  // Save it as a flashcard, with the card's own Save.
  let card: SavedWord | undefined
  const offSave = strip.on.save((saved) => {
    card = saved
    finish('save')
  })
  const save = task('save')
  await say(LINES.tapSave, { after: 'listening' })
  const saved = await save
  offSave()
  if (!alive()) return
  if (saved === 'done' && card) {
    mood('proud')
    gesture('yes')
    void showFlashcard(card)
    await say(LINES.likeThat)
    await say(LINES.findThem, { after: 'idle' })
  }
  $('flash-slot').innerHTML = ''

  // Say the line back.
  const said = task('say')
  await say(LINES.sayWithMe, { after: 'listening' })
  await say(joinTokens(strip.sample().source), {
    lang: L().voice,
    en: strip.sample().translation,
    after: 'listening'
  })
  if (finishers.say) void sayIt().then(() => finish('say'))
  const how = await said
  $('answers').innerHTML = ''
  if (!alive()) return
  if (how === 'done') {
    mood('correct')
    gesture('giggle')
    await say(L().perfect, { lang: L().voice, after: 'proud' })
  }
  hold(false)

  // Checkpoints: at the end of a scene the strip glows; pointing at it opens one question about a
  // line just heard, answered in the learner's own words.
  TASKS = CHECKS
  taskSection = 3
  eyebrow('Scene check')
  renderTasks(null)
  await say(LINES.sceneEnds, { mood: 'curious' })
  vtitle(`<b>Sample clip</b>${L().scene}<span class="tag">Scene ends</span>`)
  strip.offer()
  const offCheckpoint = strip.on.checkpoint((phase) =>
    phase === 'open' ? finish('glow') : finish('answer', phase === 'done' ? 'done' : 'skip')
  )
  const glow = task('glow')
  await say(LINES.pointGlow, { after: 'listening' })
  if ((await glow) === 'done') {
    const answer = task('answer')
    await say(LINES.ownWords, { after: 'listening' })
    if ((await answer) === 'done') {
      mood('proud')
      gesture('yes')
      await say(LINES.countsToday)
    }
  }
  offCheckpoint()
  if (!alive()) return
  await say(LINES.thirdVideo, { after: 'idle' })

  pace = 1
  // Ready: Duet back in the middle, alone, as it began; a welcome, and off they go.
  ready()
  await say(LINES.welcome(state.placed), { mood: 'adoring', after: 'adoring' })
  await say(LINES.keys, { mood: 'curious', after: 'idle' })
  if (!alive()) return
  if (mac && !state.trusted) await allowVideos()
  if (!alive()) return
  await sendOff()
  gesture('wave')
}

// macOS: the one permission Duet needs before a real video (Accessibility, to read the lines and
// pause the video), asked last. One button opens the right pane of System Settings; Duet notices the
// switch go on and carries on by itself. System Audio Recording is asked the first time Explain is used.
async function allowVideos(): Promise<void> {
  const mine = run
  await say(LINES.oneOk, { mood: 'curious', after: 'listening' })
  const how = await ask([
    { label: 'Open System Settings', value: 'open' },
    { label: 'Later', value: 'later', quiet: true }
  ])
  if (how === 'later') {
    await say(LINES.askLater, { mood: 'encourage', after: 'idle' })
    return
  }
  window.duet.welcome.openSettings('accessibility')
  const box = $('answers')
  box.innerHTML =
    '<span class="waiting"><i></i>Waiting for the switch in System Settings…</span><button type="button" class="chip quiet" id="later">Later</button>'
  mood('listening')
  const later = new Promise<boolean>((r) => ($('later').onclick = () => r(false)))
  const switched = (async (): Promise<boolean> => {
    while (mine === run) {
      await wait(1000)
      const now = await window.duet.getState().then(
        (s) => s.status.trusted,
        () => false
      )
      if (now) return true
    }
    return false
  })()
  const on = await Promise.race([later, switched])
  box.innerHTML = ''
  if (mine !== run) return
  if (on) {
    mood('correct')
    gesture('yes')
    await say(LINES.allSet, { after: 'adoring' })
  } else await say(LINES.askLater, { mood: 'encourage', after: 'idle' })
}

// The keys that show and hide Duet (the learner's own setting), as flat keycaps: Option and Shift as
// their symbols on a Mac.
const KEY_ICON: Record<string, string> = {
  option:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Option"><path d="M3 6h6l6 12h6M15 6h6"/></svg>',
  shift:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-label="Shift"><path d="M12 3.5 3.5 12H8v8h8v-8h4.5z"/></svg>'
}
function keycaps(): string {
  return state.shortcut
    .split('+')
    .map((key) => {
      const k = key.toLowerCase()
      if (k === 'alt' || k === 'option') return mac ? KEY_ICON.option : 'Alt'
      if (k === 'shift') return mac ? KEY_ICON.shift : 'Shift'
      if (k === 'commandorcontrol' || k === 'cmdorctrl') return mac ? '⌘' : 'Ctrl'
      if (k === 'command' || k === 'cmd' || k === 'super' || k === 'meta') return mac ? '⌘' : 'Win'
      if (k === 'control' || k === 'ctrl') return mac ? '⌃' : 'Ctrl'
      return esc(key)
    })
    .map((cap) => `<kbd>${cap}</kbd>`)
    .join('')
}

/** Duet's last line, about what the app is for, and the way into the app under it. */
async function sendOff(): Promise<void> {
  await say(LINES.pressPlay(state.lang), { mood: 'amazed', after: 'adoring' })
  const open = $('open-app')
  open.hidden = false
  gesture('nod')
  open.focus()
}
$('open-app').onclick = async () => {
  mood('adoring')
  gesture('wave')
  stopVoice()
  stream?.getTracks().forEach((t) => t.stop())
  await wait(500)
  window.duet.welcome.done()
}
/** The end: the window to Duet alone, centred and a little bigger; what it says is all there is. */
function ready(): void {
  $('skip').hidden = true
  progress(4, 1)
  eyebrow('')
  $('tasks').innerHTML = ''
  $('flash-slot').innerHTML = ''
  $('win').classList.add('ending')
  intro(true)
}

// ── Placement ──────────────────────────────────────────────────────────────────────────────────
// A vocabulary test by frequency band: a word, its meaning to pick from four (or "Not sure"). It
// starts at everyday words; a right answer goes up a band, a miss gets one more word at that band,
// and two misses come down a band. It stops at the ceiling, after 2 to 7 words. Anyone placed high
// also gets one whole line, so guessing single words can't put them too high. The result is the
// bands passed (0–4).
let asked = 0
async function placement(): Promise<number> {
  asked = 0
  scene('test')
  $('test-card').hidden = true
  $('estimate').innerHTML = ''
  await say(LINES.findLevel(state.lang), { after: 'curious' })
  await say(LINES.pickMeaning, { after: 'listening' })
  let top: number
  if (await band(1)) {
    top = 2
    if (await band(2)) {
      top = 3
      if (await band(3)) top = 4
    }
  } else top = (await band(0)) ? 1 : 0
  if (top >= 3 && !(await lineCheck())) top--
  $('test-card').hidden = true
  // Just the level: the word, with the home's brush stroke wiping in under it.
  $('estimate').innerHTML =
    `<b>${LEVEL_NAMES[top]}<svg class="brush" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><path d="M1.2 3.9 C 6 2.6, 18 2.2, 34 2.5 C 52 2.8, 70 2.1, 86 2.4 C 93 2.5, 98.4 2.9, 99.3 3.8 C 99.8 4.6, 98.6 5.5, 95 5.7 C 80 6.2, 64 5.6, 46 6 C 30 6.3, 14 6, 5 5.8 C 2.2 5.7, 0.6 5, 1.2 3.9 Z"/></svg></b>`
  progress(1, 1)
  return top
}
/** Up to two words at a band: passed on the first right answer. */
async function band(b: number): Promise<boolean> {
  for (const [i, item] of L().bands[b].entries()) {
    if (i === 1) await say(LINES.another, { after: 'listening' })
    if (await quiz(item)) {
      mood('correct')
      gesture('yes')
      if (b < 3) await say(b === 0 ? LINES.harderGood : LINES.harderNice, { after: 'listening' })
      return true
    }
  }
  mood('encourage')
  if (b > 0) await say(b === 1 ? LINES.easier : LINES.hard, { after: 'listening' })
  return false
}
function showCard(word: string, read: string, isLine: boolean, hearText: string): void {
  const card = $('test-card')
  card.hidden = false
  card.classList.toggle('line', isLine)
  card.classList.remove('in')
  void card.offsetWidth
  card.classList.add('in')
  $('test-word').innerHTML = `<span lang="${state.lang}">${esc(word)}</span>`
  $('test-read').textContent = read
  $('test-mean').textContent = ''
  $('hear').onclick = () => hear(hearText)
  expectClip(L().voice, hearText)
}
/** One word, its meaning picked from four or "Not sure". Shows the answer either way. */
async function quiz(item: Item): Promise<boolean> {
  showCard(item.word, item.read ?? '', false, item.word)
  const pick = await choose(shuffle([item.en, ...item.wrong]), item.en)
  $('test-mean').textContent = item.en
  progress(1, Math.min(0.9, ++asked / 6))
  return pick === item.en
}
/** A whole line from a show, its meaning picked from three: for anyone placed high. */
async function lineCheck(): Promise<boolean> {
  showCard(L().full, '', true, L().full)
  await say(LINES.lastOne, { after: 'listening' })
  const { right, wrong } = L().check
  const pick = await choose(shuffle([right, ...wrong]), right)
  $('test-mean').textContent = right
  const ok = pick === right
  if (ok) {
    mood('amazed')
    gesture('yes')
  }
  return ok
}
/** The meanings as pills under the word, with "Not sure"; marks the right one (and a wrong pick). */
function choose(options: string[], right: string): Promise<string> {
  if (skipped) return never()
  const mine = run
  const box = $('test-answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    for (const o of [...options, '']) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (o ? '' : ' quiet unsure')
      b.innerHTML = `<span>${esc(o || 'Not sure')}</span>`
      b.onclick = async () => {
        box.querySelectorAll('button').forEach((x) => (x.disabled = true))
        box.querySelectorAll<HTMLElement>('.chip').forEach((x) => {
          if (x.textContent === right) x.classList.add('right')
        })
        if (o && o !== right) b.classList.add('wrong')
        readyAt = Date.now() + 250
        await wait(o === right ? 600 : 1100)
        box.innerHTML = ''
        if (mine === run) resolve(o)
      }
      box.append(b)
    }
  })
}
function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
/** The word said, in the language's voice (whether or not Duet talks): to recognise it by ear. */
function hear(text: string): void {
  // Duet's recorded voice if this word has a clip; the system's otherwise.
  void playClip(L().voice, text).then((played) => {
    if (played || !('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = L().voice
    const v = voiceFor(L().voice)
    if (v) u.voice = v
    u.rate = 0.9
    speechSynthesis.speak(u)
  })
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────────
function setSound(on: boolean): void {
  state.sound = on
  $('sound').setAttribute('aria-pressed', String(on))
  $('sound').setAttribute('aria-label', on ? 'Mute Duet' : 'Let Duet talk out loud')
  if (!on) stopVoice()
}
$('sound').onclick = () => setSound(!state.sound)
$('skip').onclick = () => {
  run++
  skipped = true
  stopVoice()
  $('answers').innerHTML = ''
  readyAt = 0
  ready()
  void wake()
    .then(() => say(LINES.skipped, { mood: 'encourage', after: 'idle' }))
    .then(() => say(LINES.keys, { mood: 'curious', after: 'idle' }))
    .then(() => sendOff())
}

/** Starts the first run, with the learner's saved shortcut and (on macOS) whether Accessibility is on. */
export async function start(): Promise<void> {
  document.documentElement.classList.add(mac ? 'mac' : 'win32')
  // A replay goes back to the app it came from.
  if (replay) $('open-app').firstChild!.textContent = 'Back to the Duet app'
  speechSynthesis.getVoices()
  try {
    const { settings, status } = await window.duet.getState()
    state.shortcut = settings.shortcut
    state.lang = settings.language
    state.trusted = status.trusted
  } catch {
    // The defaults do: the first run still works without them.
  }
  try {
    await flow()
  } catch (error) {
    // Never stuck: whatever went wrong, the way into the app is there.
    console.error(error)
    $('open-app').hidden = false
  }
}
