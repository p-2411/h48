// Preview only: the first run as a conversation with Duet, on the real mascot engine.
// Duet wakes out of the app icon, talks (browser speech, with captions), places the learner with a
// few questions in their language, asks for each permission just before it's needed, then hops onto
// the strip over a short clip for three beats: your words light up, point at one, say something.
// Built into one file by build.mjs; nothing here talks to the app.
import '../../src/renderer/src/components/duet/duet.css'
import { createDuet, type DuetEngine, type DuetMood, type DuetGesture } from '../../src/renderer/src/components/duet/engine'

type Lang = 'es' | 'ja' | 'ko'
type Q = { ask: string; en: string; ok: string[]; praise: string }
type Content = {
  name: string
  voice: string
  hello: string
  helloEn: string
  qs: Q[]
  line: { pairs: [string, string, string][]; full: string; en: string }
  focus: { word: string; read: string; mean: string }
  sayIt: string
  sayItEn: string
  perfect: string
}

// Each pair: English, the word learnt, its rung ('' stays English).
const C: Record<Lang, Content> = {
  es: {
    name: 'Spanish',
    voice: 'es-ES',
    hello: '¡Español! Me encanta.',
    helloEn: 'Spanish! I love it.',
    qs: [
      { ask: 'Hola, ¿cómo estás?', en: 'Hi, how are you?', ok: ['Bien, gracias', 'Muy bien, ¿y tú?'], praise: '¡Muy bien!' },
      { ask: '¿Qué te gusta ver?', en: 'What do you like to watch?', ok: ['Me gustan las series', 'Veo muchas películas'], praise: '¡Genial!' },
      { ask: 'Si pudieras vivir en otra ciudad, ¿cuál elegirías y por qué?', en: 'If you could live in another city, which would you pick, and why?', ok: ['Madrid, por la comida'], praise: '¡Impresionante!' }
    ],
    line: {
      pairs: [['Leave', 'Deja', 'new'], [' ', ' ', ''], ['the keys', 'las llaves', 'seen'], [' on ', ' on ', ''], ['the table', 'la mesa', 'known'], ['; ', '; ', ''], ['I’ll be back', 'vuelvo', 'say'], [' ', ' ', ''], ['tomorrow', 'mañana', 'use'], ['.', '.', '']],
      full: 'Deja las llaves en la mesa; vuelvo mañana.',
      en: 'Leave the keys on the table; I’ll be back tomorrow.'
    },
    focus: { word: 'las llaves', read: 'lahs YAH-ves', mean: 'the keys' },
    sayIt: 'vuelvo mañana',
    sayItEn: 'I’ll be back tomorrow',
    perfect: '¡Perfecto!'
  },
  ja: {
    name: 'Japanese',
    voice: 'ja-JP',
    hello: '日本語！いいね。',
    helloEn: 'Japanese! Nice.',
    qs: [
      { ask: 'こんにちは、元気？', en: 'Hi, how are you?', ok: ['元気だよ', 'うん、元気！'], praise: 'いいね！' },
      { ask: '何を見るのが好き？', en: 'What do you like to watch?', ok: ['アニメが好き', 'ドラマをよく見る'], praise: 'すごい！' },
      { ask: 'もし別の街に住めるなら、どこを選ぶ？どうして？', en: 'If you could live in another city, where would you pick, and why?', ok: ['京都かな、静かだから'], praise: '完璧！' }
    ],
    line: {
      pairs: [['Leave', '置いといて', 'new'], [' ', ' ', ''], ['the keys', '鍵', 'seen'], [' on ', ' on ', ''], ['the table', 'テーブル', 'known'], ['; ', '; ', ''], ['I’ll be back', '戻る', 'say'], [' ', ' ', ''], ['tomorrow', '明日', 'use'], ['.', '.', '']],
      full: '鍵はテーブルに置いといて。明日戻るから。',
      en: 'Leave the keys on the table; I’ll be back tomorrow.'
    },
    focus: { word: '鍵', read: 'kagi', mean: 'key, keys' },
    sayIt: '明日戻るから',
    sayItEn: 'I’ll be back tomorrow',
    perfect: '完璧！'
  },
  ko: {
    name: 'Korean',
    voice: 'ko-KR',
    hello: '한국어! 좋아요.',
    helloEn: 'Korean! Great.',
    qs: [
      { ask: '안녕, 잘 지내?', en: 'Hi, how are you?', ok: ['잘 지내', '응, 잘 지내!'], praise: '좋아요!' },
      { ask: '뭐 보는 거 좋아해?', en: 'What do you like to watch?', ok: ['드라마 좋아해', '영화 많이 봐'], praise: '대단해요!' },
      { ask: '다른 도시에서 살 수 있다면 어디를 고를 거야? 왜?', en: 'If you could live in another city, where would you pick, and why?', ok: ['부산, 바다가 좋아서'], praise: '완벽해요!' }
    ],
    line: {
      pairs: [['Leave', '두고 가', 'new'], [' ', ' ', ''], ['the keys', '열쇠', 'seen'], [' on ', ' on ', ''], ['the table', '탁자', 'known'], ['; ', '; ', ''], ['I’ll be back', '돌아올게', 'say'], [' ', ' ', ''], ['tomorrow', '내일', 'use'], ['.', '.', '']],
      full: '열쇠는 탁자 위에 두고 가. 내일 돌아올게.',
      en: 'Leave the keys on the table; I’ll be back tomorrow.'
    },
    focus: { word: '열쇠', read: 'yeolsoe', mean: 'key, keys' },
    sayIt: '내일 돌아올게',
    sayItEn: 'I’ll be back tomorrow',
    perfect: '완벽해요!'
  }
}
// What Duet takes from how far the learner got (questions answered).
const PLACED = [
  'No problem, we start from zero. I’ll bring in a few easy words at a time.',
  'You know a little already. I’ll start with everyday words.',
  'Nice, you’re past the basics. I’ll put more of each line in.',
  'You’re good! I’ll give you most of each line, and help where it gets hard.'
]

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const state = { lang: 'es' as Lang, os: 'mac' as 'mac' | 'win', sound: true, mic: 'ask' as 'ask' | 'yes' | 'no', run: 0, placed: 0, kept: false }
const L = (): Content => C[state.lang]

// ── Duet ────────────────────────────────────────────────────────────────────────────────────────
const svg = $('duet') as unknown as SVGSVGElement
const theme = (): 'light' | 'dark' => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
let duet: DuetEngine = createDuet(svg, { theme: theme() }, 'asleep')
const mood = (m: DuetMood): void => duet.setState(m)
const gesture = (g: DuetGesture): void => duet.gesture(g)

// ── Speaking: the voice if there is one, and the caption either way, word by word ────────────────
function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis?.getVoices?.() ?? []
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)))
}
/** Duet says one line: the caption fills in as it's spoken; resolves when it's done. */
let saysSinceYou = 0
async function say(text: string, opts: { lang?: string; en?: string; after?: DuetMood } = {}): Promise<void> {
  const run = state.run
  // What the learner said stays while Duet answers it, then makes way.
  if (++saysSinceYou > 1) $('you').innerHTML = ''
  const lang = opts.lang ?? 'en-US'
  const cap = $('caption')
  const native = !lang.startsWith('en')
  cap.innerHTML = `<span class="said" lang="${lang.slice(0, 2)}"></span>${opts.en ? `<button type="button" class="show-en" id="show-en">Show English</button><span class="en" hidden>${opts.en}</span>` : ''}`
  cap.classList.toggle('native', native)
  const said = cap.querySelector('.said') as HTMLElement
  const tokens = native && !/\s/.test(text) ? [...text] : text.split(/(\s+)/)
  const showEn = cap.querySelector('#show-en') as HTMLButtonElement | null
  if (showEn) showEn.onclick = () => { showEn.hidden = true; (cap.querySelector('.en') as HTMLElement).hidden = false }
  duet.setOptions({ speaking: true })
  mood('speaking')
  let shown = 0
  const reveal = (upTo: number): void => {
    for (; shown < Math.min(upTo, tokens.length); shown++) {
      const s = document.createElement('span')
      s.className = 'tok'
      s.textContent = tokens[shown]
      said.append(s)
    }
  }
  // Rough speaking time when there's no voice or no word events: ~14 characters a second.
  const ms = Math.max(900, (text.length / (native ? 7 : 14)) * 1000)
  const perTok = ms / tokens.length
  let spoke = false
  if (state.sound && 'speechSynthesis' in window) {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    const v = voiceFor(lang)
    if (v) u.voice = v
    u.rate = native ? 0.92 : 1.02
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
    speechSynthesis?.cancel?.()
    for (let i = 1; i <= tokens.length; i++) {
      if (run !== state.run) return
      reveal(i)
      await wait(perTok)
    }
  }
  if (run !== state.run) return
  duet.setOptions({ speaking: false })
  mood(opts.after ?? 'listening')
}

// ── Answers: chips to tap, and the mic to speak ──────────────────────────────────────────────────
type Chip = { label: string; value: string; quiet?: boolean; lang?: string }
/** Shows the answers and resolves with the one tapped or said. */
function ask(chips: Chip[], opts: { mic?: boolean; speakLang?: string } = {}): Promise<string> {
  const box = $('answers')
  box.innerHTML = ''
  return new Promise((resolve) => {
    const done = (v: string): void => { box.innerHTML = ''; resolve(v) }
    for (const c of chips) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip' + (c.quiet ? ' quiet' : '')
      if (c.lang) b.lang = c.lang
      b.textContent = c.label
      b.onclick = () => { you(c.label, c.lang); done(c.value) }
      box.append(b)
    }
    if (opts.mic) {
      const m = document.createElement('button')
      m.type = 'button'
      m.className = 'mic'
      m.setAttribute('aria-label', 'Answer out loud')
      m.innerHTML = MIC + '<span>Say it</span>'
      m.onclick = async () => {
        const heard = await listen(opts.speakLang ?? 'en-US', chips)
        if (heard) { you(heard.said, opts.speakLang?.slice(0, 2)); done(heard.value) }
      }
      box.prepend(m)
    }
  })
}
const MIC = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
/** What the learner said or tapped, shown briefly under Duet's caption. */
function you(text: string, lang?: string): void {
  saysSinceYou = 0
  const y = $('you')
  y.innerHTML = `<span${lang ? ` lang="${lang}"` : ''}>${text}</span>`
  y.classList.remove('in'); void y.offsetWidth; y.classList.add('in')
}

/** The microphone: asked for just before the first time it's used. */
async function micAllowed(): Promise<boolean> {
  if (state.mic !== 'ask') return state.mic === 'yes'
  const box = $('answers')
  box.hidden = true
  await say('To hear you, I need your microphone. I only listen while the button is lit.')
  const s = $('sheet')
  s.innerHTML = `<div class="ask-mic"><button type="button" class="chip" id="mic-yes">Allow microphone</button><button type="button" class="chip quiet" id="mic-no">I’ll tap instead</button></div>`
  s.hidden = false
  const yes = await new Promise<boolean>((r) => { $('mic-yes').onclick = () => r(true); $('mic-no').onclick = () => r(false) })
  s.hidden = true
  if (yes) await systemSheet(state.os === 'mac' ? '“Duet” would like to access the microphone.' : 'Let Duet use your microphone?')
  state.mic = yes ? 'yes' : 'no'
  box.hidden = false
  if (!yes) { box.querySelector('.mic')?.remove(); mood('idle'); await say('No problem. Tap an answer.') }
  return yes
}
/** The OS's own prompt, drawn just enough to show where it comes in. */
function systemSheet(text: string): Promise<void> {
  const s = $('sheet')
  s.innerHTML = `<div class="sys"><b>${text}</b><small>Duet listens only while you hold the mic button.</small><div class="sys-row"><button type="button" class="sys-btn">Don’t Allow</button><button type="button" class="sys-btn primary" id="sys-ok">Allow</button></div></div>`
  s.hidden = false
  return new Promise((r) => {
    s.querySelectorAll('button').forEach((b) => (b.onclick = () => { s.hidden = true; r() }))
  })
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number } }) => void; onerror: () => void; onend: () => void; start(): void; stop(): void }
/** Listens once: the browser's speech recognition where it works, otherwise a stand-in that
 *  "hears" the first answer, so the flow can be felt anywhere. */
async function listen(lang: string, chips: Chip[]): Promise<{ said: string; value: string } | null> {
  if (!(await micAllowed())) return null
  const box = $('answers')
  box.classList.add('listening')
  mood('listening')
  $('listen').hidden = false
  const fake = chips.find((c) => !c.quiet) ?? chips[0]
  const Rec = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition
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
  // Close enough to one of the answers? Otherwise it's taken as a try at the first.
  const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const match = chips.find((c) => norm(heard).includes(norm(c.label).slice(0, 4)))
  return { said: heard, value: (match ?? fake).value }
}

// ── Scenes ───────────────────────────────────────────────────────────────────────────────────────
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
  duet.setOptions({ theme: slotId === 'strip-slot' ? 'dark' : theme() })
}
// The strip changes size as words swap and the full line opens: Duet rides along.
new ResizeObserver(() => { if ($('duet-box').dataset.slot === 'strip-slot') dock('strip-slot') }).observe($('cap'))
addEventListener('resize', () => { const at = $('duet-box').dataset.slot; if (at) dock(at) })

async function flow(): Promise<void> {
  const run = ++state.run
  const alive = (): boolean => run === state.run
  // 0. The app icon, as it sits in the Dock. Opening it is the gesture that lets Duet speak.
  scene('icon')
  $('caption').innerHTML = ''
  $('you').innerHTML = ''
  $('answers').innerHTML = ''
  duet.destroy()
  duet = createDuet(svg, { theme: theme() }, 'asleep')
  $('win').classList.add('closed')
  dock('icon-slot')
  await new Promise<void>((r) => ($('open').onclick = () => r()))
  if (!alive()) return
  $('win').classList.remove('closed')
  scene('meet')
  await wait(600)
  dock('meet-slot')
  await wait(800)
  await duet.wake()
  if (!alive()) return
  gesture('wave')
  await say('Hi, I’m Duet.', { after: 'idle' })
  await wait(250)
  await say('Which language are we learning?')
  if (!alive()) return
  const lang = (await ask(
    (Object.keys(C) as Lang[]).map((k) => ({ label: C[k].name, value: k })),
    { mic: true }
  )) as Lang
  if (!alive()) return
  state.lang = lang
  mood('amazed')
  await wait(300)
  await say(L().hello, { lang: L().voice, en: L().helloEn, after: 'adoring' })
  await wait(300)

  // 1. Placement: a few questions, each a little harder; out at the first one that's too much.
  await say('Let’s see what you already know. Answer however you like.', { after: 'curious' })
  $('brand-new').hidden = false
  let placed = 0
  for (const q of L().qs) {
    if (!alive()) return
    $('pips').innerHTML = L().qs.map((_, i) => `<i class="${i < placed ? 'done' : i === placed ? 'now' : ''}"></i>`).join('')
    await say(q.ask, { lang: L().voice, en: q.en, after: 'listening' })
    const v = await Promise.race([
      ask([...q.ok.map((o) => ({ label: o, value: 'ok', lang })), { label: 'I’m not sure', value: 'unsure', quiet: true }], { mic: true, speakLang: L().voice }),
      brandNew()
    ])
    if (!alive()) return
    if (v === 'new') { placed = 0; break }
    if (v === 'unsure') { mood('encourage'); break }
    placed++
    mood('correct'); gesture('yes')
    await say(q.praise, { lang: L().voice, after: 'proud' })
  }
  $('brand-new').hidden = true
  $('pips').innerHTML = ''
  state.placed = placed
  await say(PLACED[placed], { after: 'idle' })

  // 2. Before the clip: the two macOS permissions, right when they're needed.
  await wait(200)
  await say('Let’s try it. I picked a short clip.', { after: 'determined' })
  if (state.os === 'mac') {
    await say('First, your Mac needs to let me read the video and hear it. Two switches, once.')
    scene('perms')
    dock('perm-slot')
    renderPerms()
    await ask([{ label: 'Continue', value: 'go' }])
    if (!alive()) return
  }

  // 3. The clip: Duet hops onto the strip.
  scene('clip')
  renderStrip(false)
  $('vbar-fill').classList.add('play')
  await wait(450)
  mood('amazed')
  dock('strip-slot')
  await wait(700)
  if (!alive()) return
  // Beat 1: your words light up.
  $('beat').textContent = '1 of 3'
  await wait(1400)
  hold(true)
  await say(`These words are ${L().name}. Each colour is how well you know it.`)
  renderStrip(true)
  await wait(1600)
  await say('Yellow, you’ve seen. Green, you can use.')
  await ask([{ label: 'Got it', value: 'ok' }])
  // Beat 2: point at a word.
  $('beat').textContent = '2 of 3'
  await say('Point at one.')
  $('strip').classList.add('hoverable')
  await new Promise<void>((r) => (onWordOpen = r))
  if (!alive()) return
  mood('curious')
  await say(`${L().focus.word} means ${L().focus.mean}. Tap the star and it’s yours.`)
  await Promise.race([new Promise<void>((r) => (onKeep = r)), wait(5000)])
  if (state.kept) { mood('proud'); await say('Kept. You’ll see it again tomorrow.') }
  closeWord()
  // Beat 3: say something.
  $('beat').textContent = '3 of 3'
  await say('Now say it with me.', { after: 'listening' })
  await say(L().sayIt, { lang: L().voice, en: L().sayItEn, after: 'listening' })
  await ask([{ label: 'Skip', value: 'skip', quiet: true }], { mic: true, speakLang: L().voice })
  if (!alive()) return
  mood('correct'); gesture('giggle')
  await say(L().perfect, { lang: L().voice, after: 'proud' })
  hold(false)
  await wait(400)

  // 4. Done.
  scene('done')
  dock('done-slot')
  $('summary').innerHTML = `<span><b>5</b> words met</span><span><b>${state.kept ? 1 : 0}</b> kept</span><span><b>1</b> line said</span>`
  $('keys').innerHTML = (state.os === 'mac' ? ['⌥', '⇧', 'D'] : ['Alt', 'Shift', 'D']).map((k) => `<kbd>${k}</kbd>`).join('')
  await say('That’s it. Go watch something you love. I’ll be on it.', { after: 'adoring' })
  await ask([{ label: 'Start watching', value: 'go' }])
  gesture('wave')
}

// The "I'm brand new" way out, which stays up through the placement.
function brandNew(): Promise<string> {
  return new Promise((r) => ($('brand-new').onclick = () => { you('I’m brand new'); $('answers').innerHTML = ''; r('new') }))
}

// ── Permissions ──────────────────────────────────────────────────────────────────────────────────
const perms = { ax: false, audio: false }
function renderPerms(): void {
  const row = (k: 'ax' | 'audio', title: string, hint: string, btn: string): string =>
    `<div class="perm${perms[k] ? ' on' : ''}"><span class="tick">${perms[k] ? TICK : ''}</span><span class="grow"><b>${title}</b><small>${hint}</small></span>${perms[k] ? '<span class="state">On</span>' : `<button type="button" class="btn" data-perm="${k}">${btn}</button>`}</div>`
  $('perm-list').innerHTML =
    row('ax', 'Accessibility', 'To read the lines on screen, and pause the video when you ask.', 'Open Settings') +
    row('audio', 'System Audio Recording', 'To hear how a line was said. Only the last minute, never saved.', 'Allow')
  document.querySelectorAll<HTMLButtonElement>('[data-perm]').forEach((b) => (b.onclick = () => {
    b.textContent = 'Waiting…'
    setTimeout(() => {
      perms[b.dataset.perm as 'ax' | 'audio'] = true
      renderPerms()
      if (perms.ax && perms.audio) { mood('correct'); gesture('nod') }
    }, 900)
  }))
}
const TICK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'

// ── The clip and its strip ───────────────────────────────────────────────────────────────────────
const RUNG: Record<string, string> = { new: '#b9a6f7', seen: '#ffd60a', known: '#ff9f0a', say: '#4da3ff', use: '#32d74b' }
let onWordOpen: () => void = () => undefined
let onKeep: () => void = () => undefined
function renderStrip(lit: boolean): void {
  const l = L()
  $('mix').innerHTML = l.line.pairs.map(([en, word, rung], i) =>
    !rung ? `<span class="w">${en}</span>`
      : `<span class="w sw${lit ? ' lit' : ''}" lang="${state.lang}" style="--c:${RUNG[rung]};--d:${i * 90}ms" data-word="${word}">${lit ? word : en}</span>`
  ).join('')
  $('full').innerHTML = `<span lang="${state.lang}">${l.line.full}</span>`
  $('en').textContent = l.line.en
  $('mix').querySelectorAll<HTMLElement>('.sw').forEach((w) => {
    w.onmouseenter = w.onclick = () => {
      if (!$('strip').classList.contains('hoverable') || !lit) return
      openWord(w)
    }
  })
}
function openWord(w: HTMLElement): void {
  closeWord()
  const l = L()
  const isFocus = w.dataset.word === l.focus.word
  const pair = l.line.pairs.find((p) => p[1] === w.dataset.word)!
  const f = isFocus ? l.focus : { word: pair[1], read: '', mean: pair[0].toLowerCase() }
  w.classList.add('open')
  const pop = document.createElement('div')
  pop.className = 'pop'
  pop.style.setProperty('--c', w.style.getPropertyValue('--c'))
  pop.innerHTML = `<div class="head"><span class="word" lang="${state.lang}">${f.word}</span><span class="read">${f.read}</span></div><div class="mean">${f.mean}</div><button type="button" class="act" id="keep">★ Keep</button>`
  const cap = $('cap').getBoundingClientRect(), r = w.getBoundingClientRect()
  pop.style.left = Math.max(0, r.left - cap.left + r.width / 2 - 100) + 'px'
  $('pop-slot').append(pop)
  $('keep').onclick = () => { state.kept = true; $('keep').classList.add('kept'); $('keep').textContent = '★ Kept'; onKeep() }
  onWordOpen()
  onWordOpen = () => undefined
}
function closeWord(): void {
  $('pop-slot').innerHTML = ''
  document.querySelectorAll('.w.open').forEach((w) => w.classList.remove('open'))
}
function hold(on: boolean): void {
  $('clip').classList.toggle('held', on)
  $('vbar-fill').classList.toggle('play', !on)
}

// ── Review controls (outside the window) ─────────────────────────────────────────────────────────
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
$('sound').onclick = () => {
  state.sound = !state.sound
  $('sound').setAttribute('aria-pressed', String(state.sound))
  if (!state.sound) speechSynthesis?.cancel?.()
}
$('fake-voice').onclick = () => {
  const on = $('fake-voice').getAttribute('aria-pressed') !== 'true'
  $('fake-voice').setAttribute('aria-pressed', String(on))
}
$('restart').onclick = () => {
  speechSynthesis?.cancel?.()
  Object.assign(state, { mic: 'ask', kept: false })
  Object.assign(perms, { ax: false, audio: false })
  void flow()
}
$('skip').onclick = () => {
  state.run++
  speechSynthesis?.cancel?.()
  scene('done')
  dock('done-slot')
  $('answers').innerHTML = ''
  $('caption').textContent = 'Skipped. You can meet me properly from Help, any time.'
  $('summary').innerHTML = ''
  $('keys').innerHTML = (state.os === 'mac' ? ['⌥', '⇧', 'D'] : ['Alt', 'Shift', 'D']).map((k) => `<kbd>${k}</kbd>`).join('')
  mood('idle')
}
// The theme follows the viewer until they pick one.
const dark = matchMedia('(prefers-color-scheme: dark)')
if (!document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light'
  pressGroup('data-theme-set', document.querySelector(`[data-theme-set="${document.documentElement.dataset.theme}"]`)!)
  duet.setOptions({ theme: theme() })
}
speechSynthesis?.getVoices?.()
void flow()
