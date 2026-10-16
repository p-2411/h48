// Preview only: the first run, merged. The first prototype's sectioned window (four sections across
// the title bar, Duet's column on the left, a live stage on the right). It opens on Duet alone,
// centred and writing; it talks out loud only once the learner says it may. The stage slides in at
// the language, and one video carries from there: a line in the language, the line filling in as the
// placement goes, then the clip, where the learner tries the caption window (the app's own code,
// real-overlay.tsx: its hover row, word card, Save) and saves a word as a flashcard. Built into one file by build.mjs;
// nothing here talks to the app.
import '../../src/renderer/src/components/duet/duet.css'
import { createDuet, type DuetEngine, type DuetMood, type DuetGesture } from '../../src/renderer/src/components/duet/engine'
import { joinTokens } from '../../src/shared/levels'
import type { Card } from '../../src/shared/cards'
import type { Level } from '../../src/shared/types'
import { mountOverlay } from './real-overlay'

type Lang = 'es' | 'ja' | 'ko'
type Rung = 'new' | 'seen' | 'known' | 'say' | 'use'
type Job = 'thing' | 'action' | 'describing word'
// A test word: the word, how it's read (Japanese, Korean), its meaning and three wrong ones.
type Item = { word: string; read?: string; en: string; wrong: [string, string, string] }
type Content = {
  name: string
  own: string
  voice: string
  site: string
  clip: string
  hello: string
  helloEn: string
  // Two words in each frequency band, commonest first (the first 500 words, to 2,000, to 5,000,
  // past 5,000), and a whole line to check understanding in context.
  bands: [Item[], Item[], Item[], Item[]]
  check: { right: string; wrong: [string, string] }
  // Each pair: English, the word learnt, its rung and job (or nothing: it stays English).
  pairs: [string, string, Rung?, Job?, string?][]
  full: string
  en: string
  sayIt: string
  sayItEn: string
  perfect: string
}

const C: Record<Lang, Content> = {
  es: {
    name: 'Spanish', own: 'Español', voice: 'es-ES', site: 'Netflix', clip: 'La casa de papel',
    hello: '¡Español! Me encanta.', helloEn: 'Spanish! I love it.',
    bands: [
      [{ word: 'el agua', en: 'water', wrong: ['bread', 'house', 'night'] }, { word: 'la casa', en: 'house', wrong: ['car', 'dog', 'street'] }],
      [{ word: 'la llave', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: 'la cocina', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
      [{ word: 'madrugar', en: 'to get up early', wrong: ['to stay up late', 'to hurry', 'to fall asleep'] }, { word: 'aprovechar', en: 'to make the most of', wrong: ['to put off', 'to waste', 'to approve'] }],
      [{ word: 'desvelarse', en: 'to stay awake all night', wrong: ['to reveal a secret', 'to wake someone', 'to faint'] }, { word: 'empalagoso', en: 'sickly sweet', wrong: ['bitter', 'sticky', 'stubborn'] }]
    ],
    check: { right: 'Leave the keys on the table; I’ll be back tomorrow.', wrong: ['Take the keys off the table; I left yesterday.', 'The keys are on the table; come back tomorrow.'] },
    pairs: [['Leave', 'Deja', 'new', 'action'], [' ', ' '], ['the keys', 'las llaves', 'seen', 'thing', 'lahs YAH-ves'], [' on ', ' on '], ['the table', 'la mesa', 'known', 'thing'], ['; ', '; '], ['I’ll be back', 'vuelvo', 'say', 'action'], [' ', ' '], ['tomorrow', 'mañana', 'use', 'describing word'], ['.', '.']],
    full: 'Deja las llaves en la mesa; vuelvo mañana.',
    en: 'Leave the keys on the table; I’ll be back tomorrow.',
    sayIt: 'vuelvo mañana', sayItEn: 'I’ll be back tomorrow', perfect: '¡Perfecto!'
  },
  ja: {
    name: 'Japanese', own: '日本語', voice: 'ja-JP', site: 'YouTube', clip: '深夜食堂',
    hello: '日本語！いいね。', helloEn: 'Japanese! Nice.',
    bands: [
      [{ word: '水', read: 'mizu', en: 'water', wrong: ['fire', 'tree', 'rice'] }, { word: '猫', read: 'neko', en: 'cat', wrong: ['dog', 'bird', 'fish'] }],
      [{ word: '鍵', read: 'kagi', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '台所', read: 'daidokoro', en: 'kitchen', wrong: ['bedroom', 'station', 'garden'] }],
      [{ word: '締め切り', read: 'shimekiri', en: 'deadline', wrong: ['closing time', 'entrance', 'appointment'] }, { word: '遠慮', read: 'enryo', en: 'holding back, out of politeness', wrong: ['long distance', 'patience', 'apology'] }],
      [{ word: '億劫', read: 'okkū', en: 'too much bother', wrong: ['enormous', 'ancient', 'wasteful'] }, { word: '几帳面', read: 'kichōmen', en: 'meticulous', wrong: ['shy', 'careless', 'stubborn'] }]
    ],
    check: { right: 'Leave the keys on the table; I’ll be back tomorrow.', wrong: ['Take the keys off the table; I left yesterday.', 'The keys are on the table; come back tomorrow.'] },
    pairs: [['Leave', '置いといて', 'new', 'action', 'oitoite'], [' ', ' '], ['the keys', '鍵', 'seen', 'thing', 'kagi'], [' on ', ' on '], ['the table', 'テーブル', 'known', 'thing', 'tēburu'], ['; ', '; '], ['I’ll be back', '戻る', 'say', 'action', 'modoru'], [' ', ' '], ['tomorrow', '明日', 'use', 'describing word', 'ashita'], ['.', '。']],
    full: '鍵はテーブルに置いといて。明日戻るから。',
    en: 'Leave the keys on the table; I’ll be back tomorrow.',
    sayIt: '明日戻るから', sayItEn: 'I’ll be back tomorrow', perfect: '完璧！'
  },
  ko: {
    name: 'Korean', own: '한국어', voice: 'ko-KR', site: 'Netflix', clip: '이태원 클라쓰',
    hello: '한국어! 좋아요.', helloEn: 'Korean! Great.',
    bands: [
      [{ word: '물', read: 'mul', en: 'water', wrong: ['fire', 'rice', 'tree'] }, { word: '집', read: 'jip', en: 'house', wrong: ['car', 'school', 'street'] }],
      [{ word: '열쇠', read: 'yeolsoe', en: 'key', wrong: ['door', 'bag', 'letter'] }, { word: '부엌', read: 'bueok', en: 'kitchen', wrong: ['bedroom', 'garden', 'shop'] }],
      [{ word: '마감', read: 'magam', en: 'deadline', wrong: ['makeup', 'closing door', 'feeling'] }, { word: '눈치', read: 'nunchi', en: 'reading the room', wrong: ['eyesight', 'snowfall', 'jealousy'] }],
      [{ word: '서먹하다', read: 'seomeokhada', en: 'awkward, distant', wrong: ['bitter', 'sleepy', 'greedy'] }, { word: '아쉽다', read: 'aswipda', en: 'a shame it’s over', wrong: ['easy', 'relieved', 'impatient'] }]
    ],
    check: { right: 'Leave the keys on the table; I’ll be back tomorrow.', wrong: ['Take the keys off the table; I left yesterday.', 'The keys are on the table; come back tomorrow.'] },
    pairs: [['Leave', '두고 가', 'new', 'action', 'dugo ga'], [' ', ' '], ['the keys', '열쇠', 'seen', 'thing', 'yeolsoe'], [' on ', ' on '], ['the table', '탁자', 'known', 'thing', 'takja'], ['; ', '; '], ['I’ll be back', '돌아올게', 'say', 'action', 'dora-olge'], [' ', ' '], ['tomorrow', '내일', 'use', 'describing word', 'naeil'], ['.', '.']],
    full: '열쇠는 탁자 위에 두고 가. 내일 돌아올게.',
    en: 'Leave the keys on the table; I’ll be back tomorrow.',
    sayIt: '내일 돌아올게', sayItEn: 'I’ll be back tomorrow', perfect: '완벽해요!'
  }
}
// The word the learner is walked to: "the keys", a thing they've seen before.
const FOCUS = 2
// What Duet takes from how far the placement got (questions answered).
// What the test found: how many bands were passed (0–4), what that means, and Duet's word on it.
// The learner's level: one for the learner, set by the placement, and only for how much of each line
// is swapped in. Its own words, so it never reads like a word's category (Unknown, Encountered,
// Known, Speakable, Usable, Ignored), which is per word and is what the colours show.
const LEVEL_NAMES = ['Starter', 'Beginner', 'Elementary', 'Intermediate', 'Upper intermediate']
// What that level does to the line, as Duet says it.
const PLACED = ['So I’ll start with one easy word a line.', 'So I’ll swap in a couple of words a line.', 'So about three words a line.', 'So most of each line.', 'So nearly the whole line.']
const BANDS = ['Common', 'Everyday', 'Advanced', 'Rare']
const RUNG_COLOUR: Record<Rung, string> = { new: '#b9a6f7', seen: '#ffd60a', known: '#ff9f0a', say: '#4da3ff', use: '#32d74b' }
const RUNG_LABEL: Record<Rung, string> = { new: 'New to you', seen: 'Heard', known: 'Known', say: 'You can say it', use: 'You can use it' }

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const state = { lang: 'es' as Lang, os: 'mac' as 'mac' | 'win', sound: false, mic: 'ask' as 'ask' | 'yes' | 'no', run: 0, placed: 0, saved: false }
const L = (): Content => C[state.lang]

// ── Duet ────────────────────────────────────────────────────────────────────────────────────────
const svg = $('duet') as unknown as SVGSVGElement
const theme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
let duet: DuetEngine = createDuet(svg, { theme: theme(), watch: 'near' }, 'asleep')
let feeling: DuetMood = 'idle'
const mood = (m: DuetMood): void => { feeling = m; duet.setState(m) }
// The faces that carry a feeling into the next line; the rest (listening, thinking…) give way to
// the line's own feeling, as the app's conversation layer does.
const FELT: DuetMood[] = ['correct', 'amazed', 'proud', 'encourage', 'adoring', 'curious', 'determined', 'surprised', 'laughing']
/** How Duet looks while saying a line: the feeling it's in, or the line's own. */
function feel(text: string, given?: DuetMood): DuetMood {
  if (given) return given
  if (/[?？]s*$/u.test(text)) return 'curious'
  if (/[!！]/u.test(text)) return 'amazed'
  return FELT.includes(feeling) ? feeling : 'speaking'
}
const gesture = (g: DuetGesture): void => duet.gesture(g)

// ── What Duet says ───────────────────────────────────────────────────────────────────────────────
// Out loud only once allowed; written either way. Writing goes at a quick reading pace (people read
// faster than they listen), and each line then stays a moment, longer for longer lines, before the
// next one replaces it. A line that's answered (chips) waits for the answer instead.
const WRITE_CPS = { en: 50, native: 18 }
let readyAt = 0
// Lines stay longer where the learner is watching the video, not Duet (Watch & learn, Scene check).
let pace = 1
/** How long a line stays before the next one: a short beat plus time to read it. */
function readMs(text: string, native: boolean): number {
  const ms = native ? 400 + text.length * 55 : 300 + text.split(/\s+/).length * 130
  return Math.min(1800, Math.max(600, ms))
}
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis?.getVoices?.() ?? []
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)))
}
let saysSinceYou = 0
async function say(text: string, opts: { lang?: string; en?: string; after?: DuetMood; mood?: DuetMood } = {}): Promise<void> {
  const run = state.run
  // The last line gets its time to be read first.
  await wait(Math.max(0, readyAt - Date.now()))
  if (run !== state.run) return
  // What the learner said stays while Duet answers it, then makes way.
  if (++saysSinceYou > 1) $('you').innerHTML = ''
  const lang = opts.lang ?? 'en-US'
  const native = !lang.startsWith('en')
  const cap = $('caption')
  if (cap.querySelector('.said')?.textContent) {
    cap.classList.add('leaving')
    await wait(130)
    cap.classList.remove('leaving')
    if (run !== state.run) return
  }
  lineN++
  cap.innerHTML = `<span class="said" lang="${lang.slice(0, 2)}"></span>${opts.en ? `<button type="button" class="show-en">Show English</button><span class="en" hidden>${opts.en}</span>` : ''}`
  cap.classList.toggle('native', native)
  const said = cap.querySelector('.said') as HTMLElement
  const showEn = cap.querySelector<HTMLButtonElement>('.show-en')
  if (showEn) showEn.onclick = () => { showEn.hidden = true; (cap.querySelector('.en') as HTMLElement).hidden = false }
  const tokens = native && !/\s/.test(text) ? [...text] : text.split(/(\s+)/)
  // The show/hide keys, written as keycaps and read out by name.
  const spoken = text.replace('{keys}', state.os === 'mac' ? 'Option Shift D' : 'Alt Shift D')
  const spans = tokens.map((token) => {
    const s = document.createElement('span')
    s.className = /^\s+$/.test(token) ? 'gap' : 'tok'
    if (token === '{keys}') { s.className += ' keys'; s.innerHTML = keycaps() } else s.textContent = token
    said.append(s)
    return s
  })
  let shown = 0
  /** Shows the words up to `upTo`; with `step`, each a little after the one before. */
  const reveal = (upTo: number, step = 0): void => {
    for (let k = 0; shown < Math.min(upTo, spans.length); shown++, k++) {
      spans[shown].style.transitionDelay = step ? `${Math.round(k * step)}ms` : ''
      spans[shown].classList.add('on')
    }
  }
  // While it speaks it looks where the line takes it, not at the pointer.
  duet.setOptions({ speaking: true, watch: 'off' })
  // The mouth moves with the words (speaking: true) while the face keeps the line's feeling.
  mood(feel(text, opts.mood))
  let spoke = false
  if (state.sound && 'speechSynthesis' in window) {
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
      u.onstart = () => { started = true; clearTimeout(fallback) }
      u.onboundary = (e) => {
        let n = 0, at = 0
        for (; n < tokens.length && at <= e.charIndex; n++) at += tokens[n].length
        reveal(n)
      }
      u.onend = () => { clearTimeout(fallback); resolve(started) }
      u.onerror = () => { clearTimeout(fallback); resolve(false) }
      speechSynthesis.speak(u)
    })
    if (spoke) reveal(tokens.length)
  }
  if (!spoke) {
    // Written: the words come in one after another at reading pace, all from one start, so the
    // rhythm is even (CSS does the timing).
    const words = spans.filter((s) => s.classList.contains('tok')).length
    const total = (text.length / (native ? WRITE_CPS.native : WRITE_CPS.en)) * 1000
    const step = total / Math.max(1, words)
    // One beat for the laid-out line to be drawn before it transitions (a timer, not a frame: frames
    // stop while the window is hidden).
    await wait(20)
    let k = 0
    for (const s of spans) {
      if (s.classList.contains('gap')) { s.classList.add('on'); continue }
      s.style.transitionDelay = `${Math.round(k++ * step)}ms`
      s.classList.add('on')
    }
    shown = spans.length
    await wait(total)
    if (run !== state.run) return
  }
  if (run !== state.run) return
  // Then it watches the pointer again, but only one that comes near.
  duet.setOptions({ speaking: false, watch: 'near' })
  mood(opts.after ?? 'listening')
  // Spoken lines were already heard at speaking pace; they need only a short beat after.
  readyAt = Date.now() + (spoke ? 250 : readMs(text, native)) * pace
}

// ── Answers: pills to tap, and the mic to speak ──────────────────────────────────────────────────
type Chip = { label: string; value: string; sub?: string; quiet?: boolean; lang?: string }
function ask(chips: Chip[], opts: { mic?: boolean; speakLang?: string; preview?: (value: string) => void } = {}): Promise<string> {
  // Skipped to the end: a question still on its way never shows.
  if (skipped) return new Promise(() => undefined)
  const box = $('answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    // Picked: the pill holds a beat, the rest fade, then the row goes and Duet answers.
    const done = (v: string, chosen?: HTMLElement): void => {
      chosen?.classList.add('chosen')
      box.classList.add('choosing')
      box.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true))
      setTimeout(() => box.classList.add('gone'), 260)
      setTimeout(() => { box.innerHTML = ''; box.classList.remove('choosing', 'gone'); resolve(v) }, 440)
    }
    for (const c of chips) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (c.quiet ? ' quiet' : '')
      b.innerHTML = `<span${c.lang ? ` lang="${c.lang}"` : ''}>${c.label}</span>${c.sub ? `<small>${c.sub}</small>` : ''}`
      b.onclick = () => { you(); done(c.value, b) }
      if (opts.preview) b.onmouseenter = b.onfocus = () => opts.preview!(c.value)
      box.append(b)
    }
    if (opts.mic) {
      const m = document.createElement('button')
      m.type = 'button'
      m.className = 'mic'
      m.innerHTML = MIC + '<span>Say it</span>'
      m.onclick = async () => {
        const heard = await listen(opts.speakLang ?? 'en-US', chips)
        if (heard) { you(); done(heard.value) }
      }
      box.append(m)
    }
  })
}
const MIC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
/** The learner answered: Duet replies at once (no reading pause), with nothing echoed back. */
function you(..._said: unknown[]): void {
  saysSinceYou = 0
  readyAt = Date.now() + 250
}

/** The microphone: asked for just before the first time it's used. */
async function micAllowed(): Promise<boolean> {
  if (state.mic !== 'ask') return state.mic === 'yes'
  const box = $('answers')
  box.hidden = true
  await say('I’ll need your mic to hear you.')
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
  row.innerHTML = `<button type="button" class="chip" id="mic-yes"><span>Allow mic</span></button><button type="button" class="chip quiet" id="mic-no"><span>I’ll tap instead</span></button>`
  box.after(row)
  const yes = await new Promise<boolean>((r) => { $('mic-yes').onclick = () => r(true); $('mic-no').onclick = () => r(false) })
  row.remove()
  if (yes) await systemSheet(state.os === 'mac' ? '“Duet” would like to access the microphone.' : 'Let Duet use your microphone?')
  state.mic = yes ? 'yes' : 'no'
  readyAt = 0
  box.hidden = false
  if (!yes) { box.querySelector('.mic')?.remove(); mood('idle'); await say('No problem. Tap instead.') }
  return yes
}
/** The OS's own prompt, drawn just enough to show where it comes in. */
function systemSheet(text: string): Promise<void> {
  const s = $('sheet')
  s.innerHTML = `<div class="sys"><b>${text}</b><small>Duet listens only while the mic button is lit.</small><div class="sys-row"><button type="button" class="sys-btn">Don’t Allow</button><button type="button" class="sys-btn primary" id="sys-ok">Allow</button></div></div>`
  s.hidden = false
  return new Promise((r) => {
    s.querySelectorAll('button').forEach((b) => (b.onclick = () => { s.hidden = true; r() }))
  })
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number } }) => void; onerror: () => void; onend: () => void; start(): void; stop(): void }
/** Listens once: the browser's speech recognition where it works, otherwise a stand-in that
 *  "hears" the first answer (or the line on screen), so the flow can be felt anywhere. */
async function listen(lang: string, chips: Chip[]): Promise<{ said: string; value: string } | null> {
  if (!(await micAllowed())) return null
  const box = $('answers')
  box.classList.add('listening')
  mood('listening')
  $('listen').hidden = false
  const fake = chips.find((c) => !c.quiet) ?? chips[0] ?? { label: $('caption').querySelector('.said')?.textContent ?? '', value: 'ok' }
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition
  const heard = await new Promise<string | null>((resolve) => {
    if (!Rec || $('fake-voice').getAttribute('aria-pressed') === 'true') return void setTimeout(() => resolve(null), 1700)
    const r = new Rec()
    r.lang = lang
    r.interimResults = true
    let text = ''
    const stop = setTimeout(() => r.stop(), 6000)
    r.onresult = (e) => {
      text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(' ')
      you(text, lang.slice(0, 2))
      if (e.results[e.results.length - 1].isFinal) { clearTimeout(stop); r.stop() }
    }
    r.onerror = () => { clearTimeout(stop); resolve(null) }
    r.onend = () => { clearTimeout(stop); resolve(text || null) }
    try { r.start() } catch { resolve(null) }
  })
  box.classList.remove('listening')
  $('listen').hidden = true
  if (!heard) return { said: fake.label, value: fake.value }
  const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const match = chips.find((c) => norm(heard).includes(norm(c.label).slice(0, 4)))
  return { said: heard, value: (match ?? fake).value }
}

// ── The window: scenes, Duet's place, the intro ─────────────────────────────────────────────────
function scene(name: string): void {
  document.querySelectorAll<HTMLElement>('[data-scene]').forEach((s) => s.classList.toggle('on', s.dataset.scene === name))
  $('win').dataset.at = name
}
/** Moves Duet to the slot with this id, springing on the way (the CSS transition). */
function dock(slotId: string): void {
  const box = $('duet-box')
  // Layout offsets, not screen boxes: they ignore the window still scaling open.
  const slot = $(slotId)
  let x = 0, y = 0
  for (let n: HTMLElement | null = slot; n && n.id !== 'desk'; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop }
  box.style.left = x + 'px'
  box.style.top = y + 'px'
  box.style.width = slot.offsetWidth + 'px'
  box.dataset.slot = slotId
  box.classList.toggle('tile', slotId === 'icon-slot')
  duet.setOptions({ theme: theme() })
}
// Duet's column changes size as the stage slides in: Duet keeps to its place in it.
new ResizeObserver(() => { if ($('duet-box').dataset.slot === 'duet-slot') dock('duet-slot') }).observe($('duet-slot'))
addEventListener('resize', () => { const at = $('duet-box').dataset.slot; if (at) dock(at) })
const intro = (on: boolean): void => { $('win').classList.toggle('intro', on) }

// ── Sections: You · Your level · Try it · Ready ─────────────────────────────────────────────────
const CHAPTERS = ['Meet Duet', 'Find your level', 'Watch & learn', 'Scene check', 'All set']
function progress(ch: number, fill: number): void {
  // Five dots: done ones filled, the current one a short pill filling as its part goes by. The
  // section's name is shown once, above Duet's line.
  const el = $('chapters')
  el.setAttribute('aria-label', `Step ${Math.min(ch + 1, CHAPTERS.length)} of ${CHAPTERS.length}: ${CHAPTERS[Math.min(ch, CHAPTERS.length - 1)]}`)
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
let lineN = 0
/** Fades Duet's line out and empties it, unless a new line has come meanwhile. */
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
const vtitle = (html: string): void => { $('vtitle').innerHTML = html }

// ── Try-it list: a tick when done, Skip while it's the one to do ────────────────────────────────
type Task = { id: string; text: string }
const TRY_IT: Task[] = [
  { id: 'light', text: 'Watch your words light up' },
  { id: 'point', text: 'Point at a coloured word' },
  { id: 'save', text: 'Save it as a flashcard' },
  { id: 'say', text: 'Say the line back' }
]
const CHECKS: Task[] = [
  { id: 'glow', text: 'Point at the glowing line' },
  { id: 'answer', text: 'Answer in your own words' }
]
// The list shown, and the section it belongs to (for the progress across the top).
let TASKS = TRY_IT
let taskSection = 2
const TICK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M5 12l5 5L20 7"/></svg>'
const done = new Set<string>()
// The step just ticked, so only its row plays the tick (the list is redrawn each time).
let fresh: string | null = null
function renderTasks(now: string | null): void {
  $('tasks').innerHTML = TASKS.map((t) => {
    const cls = (done.has(t.id) ? 'done' : t.id === now ? 'now' : '') + (t.id === fresh ? ' fresh' : '')
    const past = cls === 'now' && t.id !== 'light' ? `<button type="button" class="past" data-past="${t.id}">Skip</button>` : ''
    return `<div class="task ${cls}"><span class="tk">${TICK}</span><span class="grow">${t.text}</span>${past}</div>`
  }).join('')
  progress(taskSection, TASKS.filter((t) => done.has(t.id)).length / TASKS.length)
}
const finishers: Record<string, (how: 'done' | 'skip') => void> = {}
function task(id: string): Promise<'done' | 'skip'> {
  renderTasks(id)
  return new Promise((resolve) => {
    finishers[id] = (how) => {
      delete finishers[id]
      if (how === 'done') {
        done.add(id)
        fresh = id
        // Duet takes part: a nod for a step, a proud "yes" when the whole list is done.
        if (TASKS.every((t) => done.has(t.id))) { mood('proud'); gesture('yes') } else gesture('nod')
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
  if (id) { $('answers').innerHTML = ''; readyAt = 0; finish(id, 'skip') }
})

// ── The caption window: the app's own (real-overlay.tsx), on the video ─────────────────────────
// How much of each line is swapped in (the overlay's level, 1–5) for each placement result.
const SWAPS_BY_PLACEMENT: Level[] = [1, 2, 3, 4, 5]
// The app's CSS (base.css, overlay.css and what they bring), for the caption window's shadow root.
declare const __OVERLAY_CSS__: string
const ov = mountOverlay($('real-ov'), __OVERLAY_CSS__)
/** The language's real sample line on the strip, at a level: still coming, or ready. */
function line(level: Level, ready = true): void {
  ov.setLanguage(state.lang)
  ov.setLevel(level)
  ov.showLine(ready)
}
function hold(on: boolean): void {
  $('video').classList.toggle('held', on)
  $('vbar-fill').classList.toggle('play', !on)
}
/** The word just saved, as a flashcard: front, then it turns to the back. */
async function showFlashcard(card: Card): Promise<void> {
  const c = card as Card & { expression: string; meaning?: string }
  $('flash-slot').innerHTML = `<div class="flash" id="flash"><div class="flip">
    <div class="face front"><span class="k">Flashcard</span><b lang="${state.lang}">${c.expression}</b><span class="where">Front</span></div>
    <div class="face back"><span class="k">Back</span><b>${c.meaning ?? ''}</b><i lang="${state.lang}">${joinTokens(ov.sample().source)}</i><span class="where">Duet app › Your words</span></div>
  </div></div>`
  await wait(1300)
  $('flash')?.classList.add('turned')
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────────
async function flow(): Promise<void> {
  const run = ++state.run
  const alive = (): boolean => run === state.run
  for (const id of ['caption', 'you', 'answers', 'tasks', 'eyebrow', 'flash-slot']) $(id).innerHTML = ''
  done.clear()
  pace = 1
  skipped = false
  TASKS = TRY_IT
  taskSection = 2
  $('win').classList.remove('ending')
  $('open-app').hidden = true
  readyAt = 0
  setSound(false)
  progress(0, 0)
  intro(true)
  scene('video')
  duet.destroy()
  duet = createDuet(svg, { theme: theme(), watch: 'near' }, 'asleep')
  $('win').classList.add('closed')
  dock('icon-slot')
  // The Dock icon: opening it is the click that lets Duet speak, later, if asked to.
  await new Promise<void>((r) => ($('open').onclick = () => r()))
  if (!alive()) return
  $('win').classList.remove('closed')
  await wait(600)
  dock('duet-slot')
  await wait(800)
  await duet.wake()
  if (!alive()) return

  // You. Duet writes first, and asks before it talks.
  gesture('wave')
  await say('Hi, I’m Duet.', { after: 'idle' })
  await say('Should I talk out loud, or keep it to text?', { after: 'curious' })
  const mode = await ask([{ label: 'Talk out loud', value: 'talk' }, { label: 'Keep it to text', value: 'text' }])
  if (!alive()) return
  setSound(mode === 'talk')
  mood('correct'); gesture('nod')
  await say(mode === 'talk' ? 'Great, I’ll talk.' : 'Text it is.', { after: 'idle' })

  // Still just Duet, centred: which language. The video slides in once there's a language to show.
  progress(0, 0.5)
  await say('Which language are we learning?')
  if (!alive()) return
  const lang = (await ask((Object.keys(C) as Lang[]).map((k) => ({ label: C[k].name, sub: C[k].own, value: k })), { mic: true })) as Lang
  if (!alive()) return
  state.lang = lang
  line(5)
  vtitle(`<b>${L().site}</b>A line in ${L().name}`)
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
  progress(2, 0)
  eyebrow('Find your level')
  // Said warmly, whatever it is: a starting point, not a grade.
  mood(placed >= 2 ? 'amazed' : 'adoring'); gesture(placed >= 2 ? 'yes' : 'nod')
  await say(`You’re right about ${LEVEL_NAMES[placed]}.`, { after: placed >= 2 ? 'proud' : 'adoring' })
  await say(PLACED[placed], { after: 'idle' })
  // What it means for the line: the video comes back with the line at that level.
  scene('video')
  line(SWAPS_BY_PLACEMENT[placed])
  vtitle(`<b>${L().site}</b>Your line, at your level`)
  await wait(1400)

  // Try it. The macOS permissions come first, right when they're needed.
  eyebrow('Watch & learn')
  await say('Now let’s try a real clip.', { after: 'determined' })
  pace = 1.6
  scene('video')
  vtitle(`<b>${L().site}</b>${L().clip}<span class="tag">Picked by Duet</span>`)
  line(SWAPS_BY_PLACEMENT[placed], false)
  renderTasks(null)
  $('vbar-fill').classList.remove('play'); void $('vbar-fill').offsetWidth
  $('vbar-fill').classList.add('play')
  await wait(400)
  if (!alive()) return

  // Your words light up.
  const light = task('light')
  await say('Watch the line.')
  hold(true)
  line(SWAPS_BY_PLACEMENT[placed])
  await wait(1000)
  finish('light')
  await light
  mood('proud')
  await say('Colour shows how well you know each word.')
  // Placement can be wrong: say, once, where to change it (the level on the strip's hover row).
  await say(`Too much ${L().name}? The circle on the strip changes that.`, { after: 'idle' })

  // Point at a word: the strip's own card opens, and the app hears which word was looked at.
  const offWord = ov.on.word(() => finish('point'))
  const point = task('point')
  await say('Point at a coloured word.', { after: 'listening' })
  const pointed = await point
  offWord()
  if (!alive()) return
  if (pointed === 'done') { mood('curious'); await say('That’s what it means here.') }

  // Save it as a flashcard, with the card's own Save.
  let card: Card | undefined
  const offSave = ov.on.save((saved) => { card = saved; state.saved = true; finish('save') })
  const save = task('save')
  await say('Tap Save to keep it as a flashcard.', { after: 'listening' })
  const saved = await save
  offSave()
  if (!alive()) return
  if (saved === 'done' && card) {
    mood('proud'); gesture('yes')
    void showFlashcard(card)
    await say('Saved. It’s a flashcard now.')
    await say('You’ll find it in the Duet app.', { after: 'idle' })
  }
  $('flash-slot').innerHTML = ''

  // Say the line back.
  const said = task('say')
  await say('Now say it with me.', { after: 'listening' })
  await say(joinTokens(ov.sample().source), { lang: L().voice, en: ov.sample().translation, after: 'listening' })
  if (finishers.say) void ask([], { mic: true, speakLang: L().voice }).then(() => finish('say'))
  const how = await said
  $('answers').innerHTML = ''
  if (!alive()) return
  if (how === 'done') { mood('correct'); gesture('giggle'); await say(L().perfect, { lang: L().voice, after: 'proud' }) }
  hold(false)

  // Checkpoints: at the end of a scene the strip glows; pointing at it opens one question about a
  // line just heard, answered in the learner's own words. The app's own (real-overlay.tsx).
  TASKS = CHECKS
  taskSection = 3
  eyebrow('Scene check')
  renderTasks(null)
  await say('When a scene ends, the line glows.', { mood: 'curious' })
  vtitle(`<b>${L().site}</b>${L().clip}<span class="tag">Scene ends</span>`)
  ov.offer()
  const offCheckpoint = ov.on.checkpoint((phase) => (phase === 'open' ? finish('glow') : finish('answer', phase === 'done' ? 'done' : 'skip')))
  const glow = task('glow')
  await say('Point at it for a quick question.', { after: 'listening' })
  if ((await glow) === 'done') {
    const answer = task('answer')
    await say('Answer in your own words.', { after: 'listening' })
    if ((await answer) === 'done') { mood('proud'); gesture('yes'); await say('Nice! That counts for today.') }
  }
  offCheckpoint()
  if (!alive()) return
  await say('These start after your third video.', { after: 'idle' })

  pace = 1
  // Ready: Duet back in the middle, alone, as it began; a welcome, and off they go.
  ready(false)
  await say(WELCOME[state.placed], { mood: 'adoring', after: 'adoring' })
  await say('Press {keys} to show or hide me.', { mood: 'curious', after: 'idle' })
  if (state.os === 'mac') await allowVideos()
  await sendOff()
  gesture('wave')
}

// macOS: the one permission Duet needs before a real video (Accessibility, to read the lines and
// pause the video), asked last, when it's about to be needed. One button opens the right pane of
// System Settings; Duet notices the switch go on and carries on by itself. System Audio Recording
// isn't asked here: the app asks for it the first time Explain is used.
async function allowVideos(): Promise<void> {
  await say('To show up on your videos, I need one OK from macOS.', { mood: 'curious', after: 'listening' })
  const how = await ask([{ label: 'Open System Settings', value: 'open' }, { label: 'Later', value: 'later', quiet: true }])
  if (how === 'later') { await say('No problem. I’ll ask when you open a video.', { mood: 'encourage', after: 'idle' }); return }
  // Here System Settings would open on Accessibility; Duet waits for the switch, no Continue to press.
  const box = $('answers')
  box.innerHTML = '<span class="waiting"><i></i>Waiting for the switch in System Settings…</span>'
  mood('listening')
  await wait(1800)
  box.innerHTML = ''
  mood('correct'); gesture('yes')
  await say('Done. You’re all set.', { after: 'adoring' })
}

// Duet's welcome at the end: the level, said as a good place to be.
const WELCOME = [
  'You’re a Starter, and that’s the fun part.',
  'You’re a Beginner with a head start. Lovely.',
  'Elementary already. What a nice start!',
  'Intermediate already. You’re going to fly.',
  'Upper intermediate! We’re going to have fun.'
]

// The keys that show and hide Duet, as flat keycaps: Option and Shift as their symbols on a Mac.
const KEY_ICON: Record<string, string> = {
  option: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Option"><path d="M3 6h6l6 12h6M15 6h6"/></svg>',
  shift: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-label="Shift"><path d="M12 3.5 3.5 12H8v8h8v-8h4.5z"/></svg>'
}
function keycaps(): string {
  const keys = state.os === 'mac' ? [KEY_ICON.option, KEY_ICON.shift, 'D'] : ['Alt', 'Shift', 'D']
  return keys.map((k) => `<kbd>${k}</kbd>`).join('')
}
/** Duet's last line, about what the app is for, and the way into the app under it. */
async function sendOff(): Promise<void> {
  await say(`Press play on something you love. I’ll bring the ${L().name}.`, { mood: 'amazed', after: 'adoring' })
  const open = $('open-app')
  open.hidden = false
  gesture('nod')
  open.onclick = async () => {
    // The onboarding window goes back into Duet's icon; in the app, the home base opens here.
    mood('adoring'); gesture('wave')
    await wait(500)
    $('win').classList.add('closed')
    dock('icon-slot')
  }
}
/** The end: the window to Duet alone, centred and a little bigger; what it says is all there is. */
function ready(_skipped: boolean): void {
  progress(4, 1)
  eyebrow('')
  $('tasks').innerHTML = ''
  $('flash-slot').innerHTML = ''
  $('win').classList.add('ending')
  intro(true)
}

// ── Placement ──────────────────────────────────────────────────────────────────────────────────
// A vocabulary test by frequency band, the way placement tests size what a learner knows: a word,
// its meaning to pick from four (or "Not sure", always there). It starts at everyday words; a right
// answer goes up a band, a miss gets one more word at that band, and two misses come down a band.
// It stops at the ceiling, after 2 to 7 words. Anyone placed high also gets one whole line, so
// guessing single words can't put them too high. The result is the bands passed (0–4): how much of
// each line is swapped in, and in the app the words of those bands would count as known for Auto.
const marks: ('' | 'now' | 'pass' | 'fail')[] = ['', '', '', '']
let asked = 0
async function placement(): Promise<number> {
  marks.fill('')
  asked = 0
  scene('test')
  renderBands()
  $('test-card').hidden = true
  $('estimate').innerHTML = ''
  document.querySelector('.test')!.classList.remove('done')
  // What it's for, before anything is asked.
  await say(`Let’s find your level. It sets how much of each line I put in ${L().name}.`, { after: 'curious' })
  await say('Pick what each word means. Not sure? Just say so.', { after: 'listening' })
  let top = 0
  if (await band(1)) {
    marks[0] = 'pass'
    top = 2
    if (await band(2)) { top = 3; if (await band(3)) top = 4 }
  } else top = (await band(0)) ? 1 : 0
  renderBands()
  if (top >= 3 && !(await lineCheck())) top--
  marks.forEach((m, i) => (marks[i] = i < top ? 'pass' : m === 'now' ? 'fail' : m))
  renderBands()
  $('test-card').hidden = true
  // Just the level: the word, with the home's brush stroke wiping in under it.
  document.querySelector('.test')!.classList.add('done')
  $('estimate').innerHTML = `<b>${LEVEL_NAMES[top]}<svg class="brush" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><path d="M1.2 3.9 C 6 2.6, 18 2.2, 34 2.5 C 52 2.8, 70 2.1, 86 2.4 C 93 2.5, 98.4 2.9, 99.3 3.8 C 99.8 4.6, 98.6 5.5, 95 5.7 C 80 6.2, 64 5.6, 46 6 C 30 6.3, 14 6, 5 5.8 C 2.2 5.7, 0.6 5, 1.2 3.9 Z"/></svg></b>`
  progress(1, 1)
  return top
}
/** Up to two words at a band: passed on the first right answer. */
async function band(b: number): Promise<boolean> {
  marks[b] = 'now'
  renderBands()
  for (const [i, item] of L().bands[b].entries()) {
    if (i === 1) await say('Here’s another.', { after: 'listening' })
    if (await quiz(item)) {
      marks[b] = 'pass'
      renderBands()
      mood('correct'); gesture('yes')
      if (b < 3) await say(b === 0 ? 'Good. A harder one.' : 'Nice. A harder one.', { after: 'listening' })
      return true
    }
  }
  marks[b] = 'fail'
  renderBands()
  mood('encourage')
  if (b > 0) await say(b === 1 ? 'No problem. An easier one.' : 'That one’s hard. Good to know.', { after: 'listening' })
  return false
}
/** One word, its meaning picked from four or "Not sure". Shows the answer either way. */
async function quiz(item: Item): Promise<boolean> {
  const card = $('test-card')
  card.hidden = false
  card.classList.remove('line')
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in')
  $('test-word').innerHTML = `<span lang="${state.lang}">${item.word}</span>`
  $('test-read').textContent = item.read ?? ''
  $('test-mean').textContent = ''
  $('hear').onclick = () => hear(item.word)
  const options = shuffle([item.en, ...item.wrong])
  const pick = await choose(options, item.en)
  $('test-mean').textContent = item.en
  progress(1, Math.min(0.9, ++asked / 6))
  return pick === item.en
}
/** A whole line from a show, its meaning picked from three: for anyone placed high. */
async function lineCheck(): Promise<boolean> {
  const card = $('test-card')
  card.classList.add('line')
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in')
  $('test-word').innerHTML = `<span lang="${state.lang}">${L().full}</span>`
  $('test-read').textContent = ''
  $('test-mean').textContent = ''
  $('hear').onclick = () => hear(L().full)
  await say('Last one. What does this line mean?', { after: 'listening' })
  const { right, wrong } = L().check
  const pick = await choose(shuffle([right, ...wrong]), right)
  $('test-mean').textContent = right
  const ok = pick === right
  if (ok) { mood('amazed'); gesture('yes') }
  return ok
}
/** The meanings as pills, with "Not sure"; marks the right one (and a wrong pick) before moving on. */
function choose(options: string[], right: string): Promise<string> {
  // The meanings sit under the word they're about, on the stage, not under Duet.
  const box = $('test-answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    const all = [...options, '']
    for (const o of all) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (o ? '' : ' quiet unsure')
      b.innerHTML = `<span>${o || 'Not sure'}</span>`
      b.onclick = async () => {
        box.querySelectorAll('button').forEach((x) => ((x as HTMLButtonElement).disabled = true))
        box.querySelectorAll<HTMLElement>('.chip').forEach((x) => { if (x.textContent === right) x.classList.add('right') })
        if (o && o !== right) b.classList.add('wrong')
        readyAt = Date.now() + 250
        await wait(o === right ? 600 : 1100)
        box.innerHTML = ''
        resolve(o)
      }
      box.append(b)
    }
  })
}
// The bands are kept for the result, not shown: the title bar already says where the learner is.
function renderBands(): void {
  void BANDS
}
function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}
/** The word said, in the language's voice (whether or not Duet talks): to recognise it by ear. */
function hear(text: string): void {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = L().voice
  const v = voiceFor(L().voice)
  if (v) u.voice = v
  u.rate = 0.9
  speechSynthesis.speak(u)
}


// ── Permissions ──────────────────────────────────────────────────────────────────────────────────
const perms = { ax: false, audio: false }
function renderPerms(): void {
  const row = (k: 'ax' | 'audio', title: string, hint: string, btn: string): string =>
    `<div class="perm${perms[k] ? ' on' : ''}"><span class="tick">${perms[k] ? TICK : ''}</span><span class="grow"><b>${title}</b><small>${hint}</small></span>${perms[k] ? '<span class="state">On</span>' : `<button type="button" class="btn" data-perm="${k}">${btn}</button>`}</div>`
  $('perm-list').innerHTML =
    row('ax', 'Accessibility', 'To read the lines on screen and pause the video.', 'Open Settings') +
    row('audio', 'System Audio Recording', 'To hear how a line was said. Never saved.', 'Allow')
  document.querySelectorAll<HTMLButtonElement>('[data-perm]').forEach((b) => (b.onclick = () => {
    b.textContent = 'Waiting…'
    setTimeout(() => {
      perms[b.dataset.perm as 'ax' | 'audio'] = true
      renderPerms()
      if (perms.ax && perms.audio) { mood('correct'); gesture('nod') }
    }, 900)
  }))
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────────
function setSound(on: boolean): void {
  state.sound = on
  $('sound').setAttribute('aria-pressed', String(on))
  $('sound').setAttribute('aria-label', on ? 'Mute Duet' : 'Let Duet talk out loud')
  if (!on) speechSynthesis?.cancel?.()
}
$('sound').onclick = () => setSound(!state.sound)
function pressGroup(attr: string, b: HTMLElement): void {
  document.querySelectorAll(`[${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))
}
document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => (b.onclick = () => {
  document.documentElement.dataset.theme = b.dataset.themeSet
  pressGroup('data-theme-set', b)
  const at = $('duet-box').dataset.slot; if (at) dock(at)
}))
document.querySelectorAll<HTMLButtonElement>('[data-os]').forEach((b) => (b.onclick = () => {
  state.os = b.dataset.os as 'mac' | 'win'
  $('win').classList.toggle('win11', state.os === 'win')
  pressGroup('data-os', b)
}))
$('fake-voice').onclick = () => {
  const on = $('fake-voice').getAttribute('aria-pressed') !== 'true'
  $('fake-voice').setAttribute('aria-pressed', String(on))
}
$('restart').onclick = () => {
  speechSynthesis?.cancel?.()
  Object.assign(state, { mic: 'ask', saved: false, placed: 0 })
  Object.assign(perms, { ax: false, audio: false })
  void flow()
}
let skipped = false
$('skip').onclick = () => {
  skipped = true
  state.run++
  speechSynthesis?.cancel?.()
  for (const id of ['answers', 'you']) $(id).innerHTML = ''
  ready(true)
  void say('No problem. Meet me properly from Help, any time.', { mood: 'encourage', after: 'idle' })
    .then(() => say('Press {keys} to show or hide me.', { mood: 'curious', after: 'idle' }))
    .then(() => sendOff())
}
// The theme follows the viewer until they pick one.
if (!document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  pressGroup('data-theme-set', document.querySelector(`[data-theme-set="${document.documentElement.dataset.theme}"]`)!)
  duet.setOptions({ theme: theme() })
}
speechSynthesis?.getVoices?.()
void flow()
