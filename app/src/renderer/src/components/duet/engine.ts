// Duet's animation engine (the design: visualizations/duet-alive.html; the handoff:
// docs/superpowers/specs/2026-10-15-duet-alive-mascot-handoff.md). Plain TypeScript, no React:
// every value of the face chases a target on a spring, one-shot gestures add on top, and each
// frame writes the SVG directly (only the attributes that changed). Nothing loops; states ease
// into each other.

export type DuetMood =
  | 'asleep'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'correct'
  | 'amazed'
  | 'proud'
  | 'almost'
  | 'oops'
  | 'encourage'
  | 'surprised'
  | 'confused'
  | 'curious'
  | 'laughing'
  | 'shy'
  | 'sleepy'
  | 'sad'
  | 'adoring'
  | 'determined'
export type DuetTone = 'warm' | 'excited' | 'gentle'
export type DuetGesture = 'nod' | 'mmhm' | 'yes' | 'no' | 'wave' | 'wink' | 'yawn' | 'giggle'

export interface DuetOptions {
  /** Frosted glass (the mascot) or flat (the icon look, for small sizes). */
  finish: 'glass' | 'flat'
  theme: 'dark' | 'light'
  /** Brows: drawn on for strong emotions only, always, or never. */
  brows: 'strong' | 'on' | 'off'
  /** Colour pops: the face flushes with an emotion's colour. */
  pops: boolean
  /** Doze off after 30 s with nothing happening (only where Duet waits, not mid-conversation). */
  doze: boolean
  /** Where Duet follows the cursor from: anywhere in the window, only when it comes close (a
   *  small Duet in a bar notices you without staring at every move), or not at all (while it
   *  answers, it keeps to its own animation). */
  watch?: 'window' | 'near' | 'off'
  /** Duet's voice level (0–1) while it plays, or null when there is nothing to measure. */
  speechLevel?: () => number | null
  /** Independent of the emotional pose; undefined preserves standalone preview behaviour. */
  speaking?: boolean
}

export interface DuetEngine {
  setState(mood: DuetMood, opts?: { tone?: DuetTone }): void
  /** From asleep: crouch, stretch, eyes pop open, then listening. Resolves once awake. */
  wake(): Promise<void>
  gesture(name: DuetGesture): void
  setOptions(options: Partial<DuetOptions>): void
  destroy(): void
}

type Spring = { x: number; v: number; t: number; k: number; c: number }
type Offsets = Record<string, number>
type Pose = [number, number, number, number, number]
type PoseName =
  'hidden' | 'gasp' | 'cover' | 'cheer' | 'chin' | 'cheeks' | 'shrug' | 'fist' | 'belly' | 'wave'
type MoodDef = {
  face: Record<string, number>
  hands?: PoseName
  enter?: () => void
  live?: (o: Offsets) => void
  gaze?: () => [number, number, number]
  blinks?: [number, number]
  slowBlinks?: boolean
  noBlink?: boolean
  noPointer?: boolean
}

// ── Utilities ───────────────────────────────────────────────────────────────────────────────────
const rand = (a: number, b: number): number => a + Math.random() * (b - a)
const randi = (a: number, b: number): number => Math.floor(rand(a, b + 1))
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]
const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const ease = (p: number): number => p * p * (3 - 2 * p)
const bump = (p: number): number => Math.sin(Math.PI * clamp(p))
const f = (n: number): string => n.toFixed(2)
const noise = (t: number, s = 0): number =>
  Math.sin(t * 0.71 + s) * 0.5 +
  Math.sin(t * 1.37 + s * 2.1) * 0.3 +
  Math.sin(t * 2.13 + s * 0.7) * 0.2

// ── The face, as values. Shared keys apply to both eyes; a key ending in L or R overrides one.
// eyeN is the squircle exponent: 2 is an ellipse, 3.4 the icon, 5 nearly a box. eyeRot and tilt are
// mirrored: positive lowers the inner corners (determined), negative raises them (soft). shut closes
// the eye to a sleepy line.
const BASE: Record<string, number> = {
  open: 1,
  lid: 0,
  tilt: 0,
  happy: 0,
  shut: 0,
  eyeW: 1,
  eyeH: 1,
  eyeN: 3.4,
  eyeRot: 0,
  eyeDy: 0,
  pupil: 1,
  pupW: 1,
  pupH: 1,
  lean: 1,
  rot: 0,
  smile: 0.8,
  mouthW: 1,
  round: 0,
  mouthX: 0,
  mouthBase: 0,
  mouthTilt: 0,
  blush: 0,
  brow: 0
}
const EYE_KEYS = [
  'lid',
  'tilt',
  'happy',
  'shut',
  'eyeW',
  'eyeH',
  'eyeN',
  'eyeRot',
  'eyeDy',
  'pupil',
  'pupW',
  'pupH'
]
const FACE_KEYS = [
  'open',
  'lean',
  'rot',
  'smile',
  'mouthW',
  'round',
  'mouthX',
  'mouthTilt',
  'blush',
  'brow'
]
const EYE_SPRING: Record<string, [number, number]> = {
  lid: [160, 18],
  tilt: [140, 18],
  happy: [150, 16],
  shut: [70, 14],
  eyeW: [260, 14],
  eyeH: [260, 14],
  eyeN: [200, 20],
  eyeRot: [180, 15],
  eyeDy: [180, 16],
  pupil: [220, 16],
  pupW: [260, 17],
  pupH: [260, 17]
}

// Hands: two pills, [x, y, rotation, width, height] in face units. Every pose keeps clear of the eyes.
const POSES: Record<PoseName, { L?: Pose; R?: Pose }> = {
  hidden: {},
  gasp: { L: [32, 73, -24, 8, 13.5], R: [61.5, 72.5, 24, 8, 13.5] },
  cover: { L: [41.6, 71.6, -16, 7.5, 12], R: [52, 71.4, 16, 7.5, 12] },
  cheer: { L: [7, 24, -30, 7.5, 12.5], R: [93, 24, 30, 7.5, 12.5] },
  chin: { R: [56, 77.5, -34, 7.5, 12] },
  cheeks: { L: [9, 68, -16, 7.5, 11], R: [91, 68, 16, 7.5, 11] },
  shrug: { L: [6, 75, -60, 7.5, 11], R: [94, 75, 60, 7.5, 11] },
  fist: { R: [92, 66, 0, 9, 9] },
  belly: { L: [33, 81, -72, 7.5, 11.5], R: [61, 81, 72, 7.5, 11.5] },
  wave: { R: [96, 38, 18, 7.5, 12.5] }
}
// Off-stage spots in the lower corners: hands enter and leave from here, and swing through here
// when changing pose, so they never sweep across the face.
const TUCK = { L: [4, 90], R: [96, 90] } as const

// Colour pops: each emotion flushes the colour people instinctively read it as. Routine states
// (listening, speaking, awake, asleep) stay colourless; mistakes never get red.
const HUE = {
  mint: '#8fdcb0',
  gold: '#f4c76a',
  sun: '#f7d774',
  amber: '#f2c98a',
  orange: '#f6a76b',
  flame: '#f28a5b',
  coral: '#f4a08f',
  pink: '#f5a6c0',
  rose: '#f28cb1',
  lavender: '#b9a8e3',
  violet: '#c5b3f0',
  teal: '#6cc9dc',
  blue: '#7fa6e6',
  dusk: '#9fb0d6',
  spark: '#fff2b8'
}
const QUICK: [number, number] = [0.15, 1.4]
const SLOW: [number, number] = [0.55, 2.6] // [rise, fade] in seconds
const POPS: Partial<Record<DuetMood, [string, number, [number, number]]>> = {
  correct: [HUE.mint, 1, QUICK],
  amazed: [HUE.gold, 1.15, QUICK],
  proud: [HUE.gold, 0.75, QUICK],
  encourage: [HUE.orange, 0.8, QUICK],
  almost: [HUE.amber, 0.55, QUICK],
  oops: [HUE.coral, 0.7, QUICK],
  surprised: [HUE.spark, 0.85, QUICK],
  confused: [HUE.lavender, 0.7, QUICK],
  curious: [HUE.teal, 0.6, QUICK],
  laughing: [HUE.sun, 0.85, QUICK],
  shy: [HUE.pink, 0.7, SLOW],
  adoring: [HUE.rose, 0.9, SLOW],
  sleepy: [HUE.dusk, 0.5, SLOW],
  sad: [HUE.blue, 0.75, SLOW],
  determined: [HUE.flame, 0.85, QUICK],
  thinking: [HUE.violet, 0.35, SLOW]
}

const VOWELS = [
  { o: 1, w: 1.05, r: 0 },
  { o: 1, w: 1.05, r: 0 },
  { o: 0.6, w: 1.16, r: 0 },
  { o: 0.6, w: 1.16, r: 0 },
  { o: 0.42, w: 1.18, r: 0 },
  { o: 0.8, w: 0.78, r: 0.65 },
  { o: 0.5, w: 0.68, r: 0.85 }
]

const OFFSETS = [
  'ox',
  'oy',
  'rot',
  'sx',
  'sy',
  'open',
  'happy',
  'happyL',
  'happyR',
  'pupil',
  'smile',
  'mouthOpen',
  'round',
  'mouthX',
  'mouthTilt',
  'closeL',
  'closeR',
  'blush',
  'brow',
  'pitch',
  'yaw',
  'gx',
  'gy',
  'mouthW',
  'hXL',
  'hYL',
  'hRL',
  'hXR',
  'hYR',
  'hRR'
]

const EYE = { L: { cx: 30.56, cy: 45.5 }, R: { cx: 69.64, cy: 45.57 }, w: 35.2, h: 28.8 }
const PIV = { x: 50, y: 74 }
const USER = { x: -0.3, y: 0.5 } // eye contact: the pupils exactly as drawn in the icon

// A squircle outline with a slight, fixed unevenness (each eye its own): hand-made, never perfect.
const N = 56
const ANG = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2
  return {
    c: Math.cos(a),
    s: Math.sin(a),
    kL: 1 + 0.018 * Math.sin(2 * a + 1.3) + 0.011 * Math.sin(3 * a + 1.3 * 2.3),
    kR: 1 + 0.018 * Math.sin(2 * a + 4.1) + 0.011 * Math.sin(3 * a + 4.1 * 2.3)
  }
})
function squircle(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  side: 'L' | 'R'
): string {
  const e = 2 / n
  let d = ''
  for (let i = 0; i < N; i++) {
    const p = ANG[i],
      k = side === 'L' ? p.kL : p.kR
    d +=
      (i ? 'L' : 'M') +
      f(cx + k * rx * Math.sign(p.c) * Math.abs(p.c) ** e) +
      ' ' +
      f(cy + k * ry * Math.sign(p.s) * Math.abs(p.s) ** e)
  }
  return d + 'Z'
}
function mouthPath(
  mx: number,
  my: number,
  w: number,
  smile: number,
  open: number,
  round: number
): string {
  const cy = my - smile * 1.1
  const top = cy + smile * 0.12 - round * 2.6 - open * 0.5
  const bot = cy + 0.5 + smile * 3.3 + open * 6.2 + round * 2.6
  const tc = (top - 0.25 * cy) / 0.75,
    bc = (bot - 0.25 * cy) / 0.75
  const cw = w * (0.55 + 0.45 * round)
  return `M${f(mx - w)} ${f(cy)}C${f(mx - cw)} ${f(tc)} ${f(mx + cw)} ${f(tc)} ${f(mx + w)} ${f(cy)}C${f(mx + cw)} ${f(bc)} ${f(mx - cw)} ${f(bc)} ${f(mx - w)} ${f(cy)}Z`
}

/** The face's markup. Ids are prefixed per instance so two mascots never share a mask or filter. */
function template(p: string): string {
  const eye = (s: 'L' | 'R'): string => `
    <g class="eye-wrap" data-k="wrap${s}"><g data-k="eye${s}" mask="url(#${p}mask${s})">
      <path data-k="sock${s}" class="sock"/>
      <g clip-path="url(#${p}clip${s})">
        <path data-k="cloud${s}" class="g-cloud" fill="url(#${p}cloud)"/>
        <path data-k="grain${s}" class="g-grain" fill="url(#${p}grain)"/>
        <rect data-k="pup${s}" class="pupil"/>
      </g>
    </g></g>`
  const mask = (s: 'L' | 'R'): string => `
    <mask id="${p}mask${s}" maskUnits="userSpaceOnUse" x="-60" y="-60" width="220" height="220">
      <rect x="-60" y="-60" width="220" height="220" fill="#fff"/>
      <polygon data-k="lid${s}" fill="#000"/><ellipse data-k="cheek${s}" fill="#000"/>
    </mask>`
  const lines = 'M-3.4 1.4L-2 -1.4M-0.7 1.4L0.7 -1.4M2 1.4L3.4 -1.4'
  const z = 'M-1.6 -1.6H1.6L-1.6 1.6H1.6'
  return `
  <defs>
    <clipPath id="${p}clipL"><path data-k="clipL"/></clipPath>
    <clipPath id="${p}clipR"><path data-k="clipR"/></clipPath>
    ${mask('L')}${mask('R')}
    <filter id="${p}soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="${p}grainF" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="3" numOctaves="2" seed="4" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -0.3" result="a"/>
      <feFlood class="g-flood"/><feComposite in2="a" operator="in"/>
    </filter>
    <filter id="${p}cloudF" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="11" stitchTiles="stitch" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 0 0 0 -0.7" result="a"/>
      <feFlood class="g-flood"/><feComposite in2="a" operator="in"/>
    </filter>
    <filter id="${p}glow" x="-30%" y="-40%" width="160%" height="180%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b"/>
      <feFlood class="g-glow-flood"/><feComposite in2="b" operator="in" result="glow"/>
      <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="${p}grain" patternUnits="userSpaceOnUse" width="24" height="24"><rect width="24" height="24" filter="url(#${p}grainF)"/></pattern>
    <pattern id="${p}cloud" patternUnits="userSpaceOnUse" width="80" height="80"><rect width="80" height="80" filter="url(#${p}cloudF)"/></pattern>
  </defs>
  <g data-k="head">
    <ellipse data-k="blushL" class="blush" filter="url(#${p}soft)" rx="6.5" ry="3"/>
    <ellipse data-k="blushR" class="blush" filter="url(#${p}soft)" rx="6.5" ry="3"/>
    <path data-k="linesL" class="blush-lines" d="${lines}"/>
    <path data-k="linesR" class="blush-lines" d="${lines}"/>
    <path data-k="browL" class="brow" pathLength="1"/>
    <path data-k="browR" class="brow" pathLength="1"/>
    ${eye('L')}${eye('R')}
    <path data-k="mouth" class="mouth"/>
    <rect data-k="handL" class="hand"/>
    <rect data-k="handR" class="hand"/>
    <path data-k="z0" class="z" d="${z}" opacity="0"/>
    <path data-k="z1" class="z" d="${z}" opacity="0"/>
    <path data-k="z2" class="z" d="${z}" opacity="0"/>
  </g>`
}

let instances = 0

export function createDuet(
  svg: SVGSVGElement,
  initial: Partial<DuetOptions> = {},
  start: DuetMood = 'idle'
): DuetEngine {
  const opts: DuetOptions = {
    finish: 'glass',
    theme: 'dark',
    brows: 'strong',
    pops: true,
    doze: false,
    ...initial
  }
  const prefix = `duet${++instances}-`
  svg.innerHTML = template(prefix)
  const el: Record<string, SVGElement> = {}
  svg.querySelectorAll<SVGElement>('[data-k]').forEach((node) => (el[node.dataset.k!] = node))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const M = reduced ? 0.3 : 1 // motion amplitude
  const cache = new WeakMap<Element, Record<string, string>>()
  // Writes an attribute only when its value changed: most frames touch a fraction of the DOM.
  const attr = (node: Element, name: string, value: string): void => {
    let c = cache.get(node)
    if (!c) cache.set(node, (c = {}))
    if (c[name] !== value) {
      c[name] = value
      node.setAttribute(name, value)
    }
  }
  const applyOptions = (): void => {
    svg.dataset.theme = opts.theme
    svg.dataset.finish = opts.finish
    for (const s of ['L', 'R']) {
      if (opts.finish === 'glass') el['wrap' + s].setAttribute('filter', `url(#${prefix}glow)`)
      else el['wrap' + s].removeAttribute('filter')
    }
  }
  applyOptions()

  // ── Springs ──────────────────────────────────────────────────────────────────────────────────
  const springs: Record<string, Spring> = {}
  const springList: Spring[] = []
  const S = (name: string, x: number, k: number, c: number): void => {
    springList.push((springs[name] = { x, v: 0, t: x, k, c }))
  }
  S('gx', -0.3, 900, 48)
  S('gy', 0.5, 900, 48) // pupils: fast saccades
  S('hx', 0, 55, 11)
  S('hy', 0, 55, 11) // head follows the eyes, late and soft
  S('rot', 0, 60, 10)
  S('bob', 0, 170, 12)
  S('sx', 1, 300, 11)
  S('sy', 1, 300, 11) // jelly squash and stretch
  S('lean', 1, 90, 14)
  S('open', 1, 220, 18)
  S('smile', 0.8, 160, 16)
  S('mouthW', 1, 400, 30)
  S('round', 0, 500, 36)
  S('mouthOpen', 0, 750, 42)
  S('mouthX', 0, 80, 14)
  S('mouthTilt', 0, 120, 14)
  S('blush', 0, 40, 12)
  S('brow', 0, 150, 17)
  S('zz', 0, 30, 11) // how much the sleeping z's show
  for (const side of ['L', 'R']) {
    // The right eye's springs are a touch slower, so the eyes never move as mirror copies.
    for (const k of EYE_KEYS) {
      const [kk, c] = EYE_SPRING[k]
      S(k + side, BASE[k], side === 'R' ? kk * 0.86 : kk, c)
    }
    S('handX' + side, side === 'L' ? 4 : 96, 120, 15)
    S('handY' + side, 90, 120, 15)
    S('handR' + side, 0, 80, 11)
    S('handS' + side, 0, 260, 15)
    S('handW' + side, 7.5, 200, 16)
    S('handH' + side, 12, 200, 16)
  }

  let t = 0
  let state: DuetMood = start
  let tone: DuetTone = 'warm'
  let mood: Record<string, number> = { ...BASE }
  let moodHands: PoseName = 'hidden'
  const timers = new Set<number>()
  const later = (seconds: number, fn: () => void): void => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      fn()
    }, seconds * 1000)
    timers.add(id)
  }

  // ── Hands ────────────────────────────────────────────────────────────────────────────────────
  const handPose: Record<string, { p: Pose | null; via: number }> = {
    L: { p: null, via: 0 },
    R: { p: null, via: 0 }
  }
  let handOverride: { pose: PoseName; until: number } | null = null
  function poseHands(): void {
    for (const side of ['L', 'R'] as const) {
      const over =
        handOverride && t < handOverride.until ? POSES[handOverride.pose][side] : undefined
      const p = over || POSES[moodHands][side] || null
      const cur = handPose[side]
      if (p !== cur.p) {
        const far = cur.p && p && Math.hypot(cur.p[0] - p[0], cur.p[1] - p[1]) > 14
        cur.p = p
        cur.via = far ? t + 0.16 : 0
      }
      const X = springs['handX' + side],
        Y = springs['handY' + side]
      if (p && t >= cur.via) {
        X.t = p[0]
        Y.t = p[1]
        springs['handR' + side].t = p[2]
        springs['handW' + side].t = p[3]
        springs['handH' + side].t = p[4]
        springs['handS' + side].t = 1
      } else {
        X.t = TUCK[side][0]
        Y.t = TUCK[side][1]
        springs['handS' + side].t = p ? 0.7 : 0
        springs['handR' + side].t = 0
      }
    }
  }

  // ── One-shot gestures, layered on top of the springs as offsets ──────────────────────────────
  type Anim = { t0: number; dur: number; amp: number; fn: (p: number, o: Offsets) => void }
  const anims: Anim[] = []
  // No two gestures play alike: each run gets its own speed and size, like a hand redrawing it.
  const play = (dur: number, fn: Anim['fn']): void => {
    anims.push({ t0: t, dur: dur * rand(0.88, 1.12), fn, amp: rand(0.85, 1.15) })
  }
  const gestures = {
    // Pitch tips the head forward, yaw turns it; the pupils counter-move to keep eye contact.
    nod: (a = 1): void =>
      play(0.6, (p, o) => {
        const k = a * M * (p < 0.35 ? ease(p / 0.35) : 1 - ease((p - 0.35) / 0.65))
        o.pitch += 1.4 * k
        o.oy += 2.4 * k
        o.sy -= 0.04 * k
        o.gy -= 0.35 * k
      }),
    mmhm: (): void =>
      play(0.95, (p, o) => {
        const k = M * Math.max(0, Math.sin(p * Math.PI * 2 - 0.3)) ** 1.3 * (1 - 0.45 * p)
        o.pitch += 1.2 * k
        o.oy += 2 * k
        o.sy -= 0.035 * k
        o.gy -= 0.3 * k
        o.happy += 0.22 * bump(p)
        o.smile += 0.25 * bump(p)
      }),
    yes: (): void =>
      play(1.1, (p, o) => {
        const k = M * Math.max(0, Math.sin(p * Math.PI * 4 - 0.4)) ** 1.2 * (1 - 0.35 * p)
        o.pitch += 1.6 * k
        o.oy += 3 * k
        o.sy -= 0.05 * k
        o.gy -= 0.4 * k
        o.smile += 0.25 * bump(p)
        o.happy += 0.15 * bump(p)
      }),
    no: (): void =>
      play(1.25, (p, o) => {
        const s = Math.sin(p * Math.PI * 5) * (1 - p) ** 0.8 * M
        o.yaw += 1.5 * s
        o.ox += 2.2 * s
        o.rot -= 1.5 * s
        o.gx -= 0.45 * s
        o.smile -= 0.35 * bump(p)
        o.mouthW -= 0.12 * bump(p)
      }),
    hop: (): void =>
      play(0.95, (p, o) => {
        if (reduced) return
        if (p < 0.16) {
          const k = ease(p / 0.16)
          o.sy -= 0.1 * k
          o.sx += 0.07 * k
          o.oy += 1.6 * k
        } else if (p < 0.68) {
          const q = (p - 0.16) / 0.52
          o.oy += 1.6 * (1 - ease(Math.min(1, q * 3))) - 7.5 * M * Math.sin(Math.PI * q)
          o.sy += 0.07 * Math.cos(Math.PI * q)
          o.sx -= 0.045 * Math.cos(Math.PI * q)
        } else {
          const r = (p - 0.68) / 0.32
          o.sy -= 0.08 * bump(r) * (1 - r)
          o.sx += 0.06 * bump(r) * (1 - r)
        }
      }),
    surprise: (): void =>
      play(0.5, (p, o) => {
        const e = p < 0.12 ? p / 0.12 : 1 - ease((p - 0.12) / 0.88)
        o.open += 0.24 * e
        o.brow += 1.4 * e
        o.pupil -= 0.28 * e
        o.round += 0.85 * e
        o.mouthOpen += 0.45 * e
        o.smile -= 0.6 * e
        o.sy += 0.07 * bump(p / 0.3)
        o.oy -= 1.8 * e * M
      }),
    flinch: (): void =>
      play(0.5, (p, o) => {
        const e = bump(p)
        o.sy -= 0.08 * e
        o.sx += 0.05 * e
        o.oy += 1.4 * e * M
        o.ox += Math.sin(p * 40) * 0.5 * (1 - p) * M
      }),
    giggle: (): void =>
      play(1.1, (p, o) => {
        const d = 1 - p,
          s = Math.sin(p * Math.PI * 9)
        o.happy += 0.6 * bump(p * 1.6)
        o.smile += 0.35 * d
        o.oy += Math.abs(s) * -1.1 * d * M
        o.rot += Math.sin(p * Math.PI * 6) * 2.2 * d * M
        o.mouthOpen += 0.3 * Math.abs(s) * d
      }),
    hmm: (): void =>
      play(1.2, (p, o) => {
        o.rot += 3 * M * bump(p)
        o.mouthX += 1.2 * bump(p)
      }),
    wave: (): void => {
      handOverride = { pose: 'wave', until: t + 1.7 }
      play(1.8, (p, o) => {
        o.hRR += Math.sin(p * Math.PI * 7) * 26 * (1 - p * 0.5) * M
        o.happy += 0.2 * bump(p)
        o.smile += 0.2 * bump(p)
        o.rot += 3 * bump(p) * M
      })
    },
    wink: (): void =>
      play(0.6, (p, o) => {
        const e = p < 0.22 ? ease(p / 0.22) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4)
        o.closeR += e
        o.smile += 0.35 * e
        o.mouthTilt -= 7 * e
        o.rot += 4 * e * M
        o.happyL += 0.18 * e
      }),
    yawn: (): void =>
      play(2.3, (p, o) => {
        const e = Math.pow(bump(p), 0.8)
        o.mouthOpen += 1.05 * e
        o.round += 0.55 * e
        o.closeL += 0.8 * e
        o.closeR += 0.8 * e
        o.oy -= 1.4 * e * M
        o.rot += 4 * e * M
        o.sy += 0.05 * e
        o.smile -= 0.5 * e
      }),
    // Waking: a small crouch, then a stretch up as the eyes pop open and the brows lift.
    wake: (): void =>
      play(0.95, (p, o) => {
        if (p < 0.22) {
          const k = ease(p / 0.22)
          o.sy -= 0.05 * k
          o.sx += 0.035 * k
          o.oy += 1 * k
        } else {
          const q = (p - 0.22) / 0.78,
            e = bump(q) * (1 - 0.3 * q)
          o.sy += 0.075 * e * M
          o.sx -= 0.045 * e * M
          o.oy -= 2.6 * e * M
          o.brow += 0.9 * bump(q)
          o.open += 0.1 * bump(q)
          o.smile += 0.2 * bump(q)
        }
      })
  }

  // ── Blinks: scripted, at irregular intervals, sometimes double ───────────────────────────────
  let blink: { t0: number; close: number; hold: number; open: number; len: number } | null = null
  let nextBlink = 1.5
  const blinkNow = (slow = false): void => {
    if (blink && t - blink.t0 < blink.len) return
    const b = {
      t0: t,
      close: slow ? 0.14 : 0.07,
      hold: slow ? 0.12 : 0.035,
      open: slow ? 0.26 : 0.12,
      len: 0
    }
    b.len = b.close + b.hold + b.open
    blink = b
    if (Math.random() < 0.14 && !slow) later(0.26, () => blinkNow())
  }
  const blinkValue = (): number => {
    if (!blink) return 0
    const e = t - blink.t0
    if (e < blink.close) return ease(e / blink.close)
    if (e < blink.close + blink.hold) return 1
    if (e < blink.len) return 1 - ease((e - blink.close - blink.hold) / blink.open)
    return 0
  }

  // ── Gaze ─────────────────────────────────────────────────────────────────────────────────────
  const sac = {
    next: 0,
    seq: [] as [number, number, number][],
    base: { ...USER },
    micro: 0,
    lookAround: 8
  }
  const pointer = { t: -10, x: 0, y: 0, over: false, near: false }
  const near = (j: number, dy = 0): [number, number] => [
    USER.x + rand(-j, j),
    USER.y + dy + rand(-j, j)
  ]
  let thinkSide = 1
  let sleepyYawn = 0

  // ── Expressions ──────────────────────────────────────────────────────────────────────────────
  const peep = { since: 0, left: -10, amount: 0 }
  const sleepBreath = (): number => 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 5.5)
  const MOODS: Record<DuetMood, MoodDef> = {
    asleep: {
      face: {
        shut: 1,
        eyeRot: -3,
        eyeDy: 1.2,
        lean: 0.97,
        rot: 5,
        smile: 0.3,
        mouthW: 0.6,
        round: 0.5,
        mouthBase: 0.05
      },
      live: (o) => {
        const b = sleepBreath(),
          calm = 1 - peep.amount
        o.mouthOpen += 0.07 * b * calm
        o.oy += (b - 0.5) * 1.4 * M * calm
        o.rot += Math.sin(t * 0.35) * 1.5 * M * calm
      },
      gaze: () => [USER.x + rand(-0.1, 0.1), USER.y + 0.3, rand(2, 4)],
      noBlink: true
    },
    idle: { face: {} },
    listening: {
      face: { open: 1.07, happy: 0.06, pupil: 1.08, lean: 1.035, smile: 0.85 },
      gaze: () =>
        Math.random() < 0.9
          ? [...near(0.06), rand(0.9, 2.2)]
          : [USER.x + rand(-0.45, 0.45), USER.y + rand(-0.4, 0.2), rand(0.3, 0.6)],
      blinks: [2.8, 6]
    },
    thinking: {
      face: {
        lidL: 0.2,
        tiltL: -2,
        lidR: 0.04,
        eyeHR: 1.06,
        pupil: 0.9,
        smile: 0.1,
        mouthW: 0.62,
        round: 0.3
      },
      hands: 'chin',
      enter: () => {
        thinkSide = Math.random() < 0.5 ? -1 : 1
        mood.mouthX = thinkSide * 2.2
        mood.rot = -thinkSide * 5
        later(0.25, () => state === 'thinking' && gestures.hmm())
      },
      gaze: () => {
        if (Math.random() < 0.18) thinkSide *= -1
        return [thinkSide * rand(0.55, 0.9), rand(-0.95, -0.55), rand(0.5, 1.4)]
      },
      blinks: [1.4, 3.6],
      noPointer: true
    },
    speaking: {
      face: { open: 1.03, happy: 0.12, smile: 0.85, lean: 1.015 },
      gaze: () => [...near(0.08), rand(0.6, 1.4)]
    },
    correct: {
      face: {
        happy: 0.66,
        eyeRot: -5,
        smile: 1.2,
        mouthW: 1.2,
        mouthBase: 0.35,
        lean: 1.04,
        blush: 0.35
      },
      hands: 'cheer',
      enter: () => gestures.hop(),
      live: (o) => {
        const s = Math.sin(t * 11)
        o.hYL += s * 1.4 * M
        o.hYR -= s * 1.4 * M
        o.hRL += s * 8 * M
        o.hRR += s * 8 * M
        o.oy -= Math.abs(Math.sin(t * 5.5)) * 0.6 * M
      },
      // Pleased with the person: back to their eyes, with a quick bright glance up now and then.
      gaze: () =>
        Math.random() < 0.7
          ? [...near(0.05), rand(1.2, 2.4)]
          : [USER.x + rand(-0.1, 0.1), USER.y - 0.25, rand(0.4, 0.8)]
    },
    amazed: {
      face: {
        brow: 1,
        open: 1.16,
        eyeW: 0.84,
        eyeH: 1.1,
        eyeN: 2.3,
        pupil: 1.05,
        pupW: 0.72,
        pupH: 1.08,
        smile: 0.3,
        round: 0.9,
        mouthBase: 0.6,
        mouthW: 0.72,
        lean: 1.05,
        blush: 0.55
      },
      hands: 'gasp',
      enter: () => {
        gestures.surprise()
        springs.sy.v += 2.5 * M
      },
      live: (o) => {
        const j = Math.sin(t * 38) * 0.4 * M,
          k = Math.sin(t * 33 + 1) * 0.4 * M
        o.hXL += j
        o.hXR -= k
        o.hRL += j * 6
        o.hRR -= k * 6
        o.ox += Math.sin(t * 29) * 0.12 * M
      },
      gaze: () => [...near(0.03), rand(1.5, 3)],
      blinks: [4, 7]
    },
    proud: {
      face: {
        lid: 0.24,
        happy: 0.22,
        eyeRot: -3,
        smile: 1.1,
        mouthW: 1.12,
        mouthTilt: -7,
        mouthX: 1,
        rot: -4,
        lean: 1.02
      },
      enter: () => gestures.nod(0.6),
      // Proud of the person, so it looks at them; the chin-up look away is a brief beat.
      gaze: () =>
        Math.random() < 0.65
          ? [...near(0.05), rand(1.2, 2.6)]
          : [USER.x + rand(0.1, 0.4), USER.y - rand(0.5, 0.8), rand(0.5, 1)]
    },
    almost: {
      face: {
        open: 0.98,
        lid: 0.13,
        tiltL: -6,
        tiltR: 6,
        happy: 0.06,
        smile: 0.55,
        mouthW: 0.9,
        rot: 5
      },
      enter: () => {
        sac.seq = [
          [USER.x + 0.05, 0.85, 0.5],
          [USER.x, USER.y, 1.2]
        ]
        later(0.45, () => state === 'almost' && gestures.nod(0.7))
      },
      gaze: () => [...near(0.06), rand(1, 2)],
      slowBlinks: true
    },
    oops: {
      face: {
        brow: 1,
        eyeH: 0.42,
        happy: 0.62,
        eyeN: 2.4,
        eyeW: 0.9,
        eyeRot: -12,
        pupil: 0.8,
        smile: -0.1,
        mouthW: 1.25,
        mouthTilt: 5,
        rot: -3,
        lean: 0.97
      },
      hands: 'cover',
      enter: () => {
        gestures.flinch()
        blinkNow()
      },
      gaze: () => [USER.x + rand(-0.2, 0.2), 0.8, rand(1, 2)]
    },
    encourage: {
      face: {
        open: 1.05,
        happy: 0.2,
        eyeRot: -4,
        smile: 1,
        mouthW: 1.05,
        mouthBase: 0.12,
        lean: 1.03
      },
      hands: 'fist',
      enter: () => gestures.yes(),
      live: (o) => {
        o.hYR -= Math.pow(Math.abs(Math.sin(t * 4.2)), 3) * 3 * M
        o.hRR += Math.sin(t * 4.2) * 6 * M
      },
      gaze: () => [...near(0.05), rand(1, 2)]
    },
    surprised: {
      face: {
        brow: 1,
        open: 1.24,
        eyeW: 0.86,
        eyeH: 1.14,
        eyeN: 2.4,
        pupil: 0.68,
        pupW: 0.8,
        pupH: 1.05,
        smile: 0,
        round: 1,
        mouthBase: 0.3,
        mouthW: 0.6,
        lean: 0.96
      },
      enter: () => {
        gestures.surprise()
        springs.sy.v += 3 * M
      },
      gaze: () => [...near(0.03), rand(1.5, 3)],
      blinks: [4, 7]
    },
    confused: {
      face: {
        brow: 1,
        eyeHL: 1.12,
        eyeWL: 0.92,
        eyeHR: 0.72,
        lidR: 0.16,
        eyeRotR: 8,
        eyeRotL: -5,
        eyeDyL: -1.5,
        pupil: 0.9,
        smile: -0.15,
        mouthW: 0.8,
        mouthTilt: 10,
        mouthX: 2,
        rot: 7
      },
      hands: 'shrug',
      live: (o) => {
        o.rot += Math.sin(t * 0.9) * 1.5 * M
        o.hYL += Math.sin(t * 1.8) * 0.6
        o.hYR += Math.sin(t * 1.8 + 1) * 0.6
      },
      gaze: () => [pick([-1, 1]) * rand(0.4, 0.7), rand(-0.6, -0.1), rand(0.6, 1.3)]
    },
    curious: {
      face: {
        eyeHL: 1.1,
        eyeWL: 1.04,
        eyeHR: 0.94,
        pupil: 1.12,
        pupW: 0.85,
        pupH: 1.12,
        lean: 1.06,
        rot: -8,
        smile: 0.5,
        round: 0.25,
        mouthW: 0.7
      },
      live: (o) => {
        o.rot += Math.sin(t * 0.7) * 2 * M
      },
      gaze: () =>
        Math.random() < 0.85
          ? [...near(0.06), rand(0.8, 1.8)]
          : [rand(-0.8, 0.8), rand(-0.3, 0.6), rand(0.3, 0.6)]
    },
    laughing: {
      face: {
        happy: 0.8,
        eyeRot: -9,
        eyeN: 2.8,
        smile: 1.3,
        mouthW: 1.25,
        mouthBase: 0.7,
        blush: 0.45
      },
      hands: 'belly',
      live: (o) => {
        const b = Math.abs(Math.sin(t * 9))
        o.oy -= b * 1.2 * M
        o.mouthOpen += b * 0.25
        o.rot += Math.sin(t * 4.5) * 1.5 * M
        o.hYL -= b * 1.2 * M
        o.hYR -= b * 1.2 * M
      },
      gaze: () => [...near(0.05), rand(1, 2)],
      noPointer: true
    },
    shy: {
      face: {
        eyeW: 0.86,
        eyeH: 0.86,
        eyeN: 2.6,
        pupil: 0.92,
        smile: 0.6,
        mouthW: 0.6,
        blush: 1,
        rot: 6,
        lean: 0.97
      },
      hands: 'cheeks',
      live: (o) => {
        o.rot += Math.sin(t * 1.3) * 1 * M
        o.hYL += Math.sin(t * 3) * 0.4
        o.hYR += Math.sin(t * 3 + 2) * 0.4
      },
      gaze: () =>
        Math.random() < 0.25
          ? [...near(0.04), rand(0.3, 0.6)]
          : [rand(0.4, 0.8), rand(0.75, 1), rand(1, 2.2)]
    },
    sleepy: {
      face: { lid: 0.52, eyeRot: -3, open: 0.95, pupil: 0.95, smile: 0.2, mouthW: 0.7, lean: 0.98 },
      enter: () => later(0.9, () => state === 'sleepy' && gestures.yawn()),
      live: (o) => {
        o.oy += Math.sin(t * 0.6) * 0.8 * M
        o.rot += Math.sin(t * 0.4) * 2.5 * M
        if (t > sleepyYawn) {
          sleepyYawn = t + rand(6, 10)
          gestures.yawn()
        }
      },
      gaze: () => [rand(-0.4, 0.3), rand(0.6, 0.9), rand(2, 4)],
      blinks: [1.5, 3],
      slowBlinks: true,
      noPointer: true
    },
    sad: {
      face: {
        brow: 1,
        lid: 0.12,
        tiltL: -10,
        tiltR: 10,
        eyeRot: -8,
        eyeH: 0.94,
        pupil: 1.18,
        pupW: 0.9,
        pupH: 1.15,
        smile: -0.7,
        mouthW: 0.8,
        rot: 4,
        lean: 0.97
      },
      gaze: () => [rand(-0.4, 0.1), rand(0.8, 1), rand(1.5, 3)],
      slowBlinks: true,
      noPointer: true
    },
    adoring: {
      face: { happy: 0.55, eyeN: 2.6, eyeRot: -4, smile: 1.05, mouthW: 0.95, blush: 1, lean: 1.02 },
      hands: 'cheeks',
      live: (o) => {
        o.rot += Math.sin(t * 1.6) * 3 * M
        o.ox += Math.sin(t * 1.6) * 0.8 * M
      },
      gaze: () => [...near(0.04), rand(1, 2)]
    },
    determined: {
      face: {
        brow: 1,
        lid: 0.26,
        tiltL: 6,
        tiltR: -6,
        eyeRot: 7,
        eyeH: 0.92,
        pupil: 0.88,
        smile: 0.3,
        mouthW: 0.95,
        lean: 1.04
      },
      hands: 'fist',
      enter: () => gestures.yes(),
      gaze: () => [...near(0.03), rand(1.2, 2.5)]
    }
  }
  const TONES: Record<DuetTone, Record<string, number>> = {
    warm: {},
    gentle: { lid: 0.11, tiltL: -5, tiltR: 5, eyeRot: -3, happy: 0.08, smile: 0.6, rot: 4 },
    excited: { open: 1.1, happy: 0.3, eyeN: 3, smile: 1, pupil: 1.05, lean: 1.04 }
  }

  // ── Colour pops, in the face ─────────────────────────────────────────────────────────────────
  const tint = { t0: -9, c: '#fff', s: 0, rise: QUICK[0], fade: QUICK[1], last: '' }
  function pop(colour: string, strength = 1, [rise, fade] = QUICK): void {
    if (!opts.pops) return
    Object.assign(tint, { t0: t, c: colour, s: Math.min(1.2, strength), rise, fade })
  }
  function renderTint(): void {
    const e = t - tint.t0
    const amt =
      e < tint.rise
        ? ease(e / tint.rise)
        : e < tint.rise + tint.fade
          ? 1 - ease((e - tint.rise) / tint.fade)
          : 0
    const pct = (amt * tint.s * (opts.theme === 'light' ? 54 : 68)).toFixed(1)
    const key = tint.c + pct
    if (key === tint.last) return
    tint.last = key
    svg.style.setProperty('--tc', tint.c)
    svg.style.setProperty('--ta', pct + '%')
    // The glow is quiet at rest and brightens with a feeling, so it means something when it shows.
    svg.style.setProperty(
      '--g-boost',
      (amt * tint.s * (opts.theme === 'light' ? 0.14 : 0.32)).toFixed(3)
    )
  }

  // ── State ────────────────────────────────────────────────────────────────────────────────────
  let lastActivity = 0
  const activity = (): void => {
    lastActivity = t
  }
  function setState(next: DuetMood, o: { tone?: DuetTone } = {}): void {
    const changed = next !== state || (!!o.tone && o.tone !== tone)
    const def = MOODS[next]
    state = next
    svg.dataset.mood = state
    tone = o.tone || 'warm'
    sleepyYawn = t + 8
    activity()
    mood = { ...BASE, ...def.face, ...(state === 'speaking' ? TONES[tone] : {}) }
    moodHands = def.hands || 'hidden'
    if (state === 'listening') mood.rot = rand(-3, 3)
    sac.seq = []
    if (changed) def.enter?.()
    for (const k of FACE_KEYS) springs[k].t = mood[k]
    for (const side of ['L', 'R'])
      for (const k of EYE_KEYS) springs[k + side].t = mood[k + side] ?? mood[k]
    if (!changed) return
    const p = POPS[state]
    if (p) pop(p[0], p[1], p[2])
    // Anticipation: a light jelly squash and often a blink as attention shifts.
    springs.sy.v -= 1.0 * M
    springs.sx.v += 0.7 * M
    springs.bob.v += 7 * M
    if (state !== 'asleep' && Math.random() < 0.5) blinkNow()
    sac.next = t
  }

  // ── Sleep, peek and wake ─────────────────────────────────────────────────────────────────────
  let waking: Promise<void> | null = null
  function wake(): Promise<void> {
    if (waking) return waking
    if (state !== 'asleep') return Promise.resolve()
    gestures.wake()
    setState('listening')
    pop(HUE.teal, 0.85) // teal always means "Duet is awake and listening"
    springs.shutL.k = springs.shutR.k = 260 // eyes pop open faster than they drift shut
    later(0.52, () => blinkNow())
    later(0.9, () => {
      springs.shutL.k = 70
      springs.shutR.k = 60
    })
    waking = new Promise((resolve) =>
      later(0.8, () => {
        waking = null
        resolve()
      })
    )
    return waking
  }
  function sleepBehaviour(): void {
    if (pointer.near && !peep.since) peep.since = t
    if (!pointer.near && peep.since) {
      peep.since = 0
      peep.left = t
    }
    const held = peep.since ? t - peep.since : 0
    const peeping = !!peep.since && held > 0.15 // a passing cursor doesn't wake it
    const lingering = !peep.since && t - peep.left < 0.8 // stays peeking a moment after you leave
    if (peeping) {
      // One eye cracks open first; if you stay, the other joins, still drowsy.
      springs.shutL.t = held > 1.3 ? 0.32 : 0.48
      springs.shutR.t = held > 1.3 ? 0.55 : 1
      springs.rot.t = 1.5
      springs.smile.t = 0.5
    } else if (!lingering) {
      springs.shutL.t = 1
      springs.shutR.t = 1
      springs.rot.t = mood.rot
      springs.smile.t = mood.smile
    }
    peep.amount = lerp(peep.amount, peeping || lingering ? 1 : 0, 0.08)
    mood.round = 0.5 * (1 - peep.amount)
    mood.mouthBase = 0.05 * (1 - peep.amount)
    springs.zz.t = peeping || lingering ? 0 : 1
  }

  // ── Speech: from Duet's real voice when it can be measured, else its own speaking rhythm ──────
  const speech = { env: 0, vowel: VOWELS[0], quiet: 0, trough: 0, prev: 0, measured: false }
  const babble = {
    on: false,
    phase: 'gap',
    timer: 0.08,
    p: 0,
    dur: 0.15,
    amp: 0.6,
    wordsLeft: 0,
    sylLeft: 0,
    step(dt: number): number {
      if (this.phase === 'syl') {
        this.p += dt / this.dur
        if (this.p < 1) return this.amp * Math.pow(Math.sin(Math.PI * this.p), 0.7)
        if (--this.sylLeft > 0) {
          this.phase = 'gap'
          this.timer = rand(0, 0.03)
        } else if (--this.wordsLeft > 0) {
          this.phase = 'gap'
          this.timer = rand(0.04, 0.12)
        } else {
          this.phase = 'gap'
          this.timer = rand(0.35, 0.65)
          if (Math.random() < 0.35) blinkNow()
        }
        return 0
      }
      if ((this.timer -= dt) > 0) return 0
      if (this.wordsLeft <= 0) {
        this.wordsLeft = randi(3, 7)
        phraseStart()
      }
      const newWord = this.sylLeft <= 0
      if (newWord) this.sylLeft = randi(1, 3)
      const stressed = newWord && Math.random() < 0.35
      this.phase = 'syl'
      this.p = 0
      this.dur = rand(0.09, 0.2)
      this.amp = stressed ? rand(0.85, 1) : rand(0.4, 0.8)
      speech.vowel = pick(VOWELS)
      if (stressed) beat()
      return 0
    }
  }
  // Beats land as tiny nods and widened eyes; phrases often start with a glance away.
  function beat(): void {
    springs.bob.v += (tone === 'excited' ? 16 : 11) * M
    springs.open.v += 0.7
    if (Math.random() < 0.25) springs.rot.v += rand(-14, 14) * M
  }
  function phraseStart(): void {
    if (Math.random() < 0.5) {
      sac.seq = [
        [rand(-0.9, 0.5), rand(-0.5, 0.8), rand(0.45, 0.9)],
        [USER.x, USER.y, 1.5]
      ]
      sac.next = t
    }
  }
  function speak(dt: number): number {
    if (!(opts.speaking ?? state === 'speaking')) {
      babble.phase = 'gap'
      babble.wordsLeft = 0
      babble.sylLeft = 0
      return Math.max(0, speech.env - dt * 8)
    }
    const level = opts.speechLevel?.() ?? null
    if (level === null) return babble.step(dt)
    // From the real voice: a new mouth shape on each rise out of a trough, a beat on strong ones,
    // a glance at the start of a phrase (after a pause).
    if (level < 0.12) speech.quiet += dt
    else {
      if (speech.quiet > 0.3) phraseStart()
      speech.quiet = 0
    }
    if (speech.prev < 0.22 && level >= 0.22) {
      speech.vowel = pick(VOWELS)
      if (level - speech.trough > 0.45) beat()
    }
    if (level < speech.prev) speech.trough = level
    speech.prev = level
    return level
  }

  // ── Gaze ─────────────────────────────────────────────────────────────────────────────────────
  function lookAt(x: number, y: number): void {
    const d = Math.hypot(x - springs.gx.t, y - springs.gy.t)
    sac.base.x = clamp(x, -1, 1)
    sac.base.y = clamp(y, -1, 1)
    springs.gx.t = sac.base.x
    springs.gy.t = sac.base.y
    if (d > 0.6 && Math.random() < 0.4) blinkNow()
  }
  // At rest Duet mostly holds the person's eyes, with short, small glances away (people at ease
  // keep eye contact most of the time); a slow look around now and then, not every few seconds.
  function idleGaze(): [number, number, number] {
    if (t > sac.lookAround) {
      sac.lookAround = t + rand(20, 34)
      const s = Math.random() < 0.5 ? -1 : 1
      sac.seq = [
        [s * 0.9, rand(-0.2, 0.3), 0.8],
        [-s * 0.85, rand(-0.3, 0.2), 0.9]
      ]
      return [USER.x, USER.y, 1.2]
    }
    return Math.random() < 0.86
      ? [...near(0.05), rand(1.6, 3.6)]
      : [USER.x + rand(-0.75, 0.75), USER.y + rand(-0.55, 0.25), rand(0.35, 0.8)]
  }
  function speakingGaze(): [number, number, number] {
    return Math.random() < 0.9
      ? [...near(0.045), rand(1.3, 2.8)]
      : [USER.x + rand(-0.5, 0.5), USER.y + rand(-0.35, 0.15), rand(0.25, 0.5)]
  }
  function gaze(): void {
    const def = MOODS[state]
    if (t - pointer.t < 1.6 && !def.noPointer) {
      sac.base.x = clamp(pointer.x, -1, 1)
      sac.base.y = clamp(pointer.y, -1, 1)
      springs.gx.t = sac.base.x
      springs.gy.t = sac.base.y
      sac.next = t + 0.6
    } else if (t >= sac.next) {
      // Speaking, Duet holds the person's eyes, whatever the mood, with only brief small glances away.
      const talking = (opts.speaking ?? false) && !def.noPointer
      const [x, y, hold] = sac.seq.length ? sac.seq.shift()! : talking ? speakingGaze() : (def.gaze || idleGaze)()
      lookAt(x, y)
      sac.next = t + hold
    } else if (t >= sac.micro) {
      sac.micro = t + rand(0.25, 0.7) // fixational micro-saccades
      springs.gx.t = sac.base.x + rand(-0.035, 0.035)
      springs.gy.t = sac.base.y + rand(-0.03, 0.03)
    }
    springs.hx.t = (springs.gx.t - USER.x) * 0.9 // eyes lead, the head follows a beat later
    springs.hy.t = (springs.gy.t - USER.y) * 0.9
  }

  // ── Per-frame behaviour ──────────────────────────────────────────────────────────────────────
  function behave(dt: number): void {
    const def = MOODS[state]
    gaze()
    poseHands()
    if (state === 'asleep') sleepBehaviour()
    else springs.zz.t = 0
    if (!def.noBlink && t > nextBlink) {
      blinkNow(!!def.slowBlinks || (state === 'listening' && Math.random() < 0.3))
      nextBlink = t + rand(...(def.blinks || [2, 5.2]))
    }
    const env = (speech.env = speak(dt))
    if ((opts.speaking ?? state === 'speaking') || env > 0.001) {
      const v = speech.vowel
      springs.mouthOpen.t = mood.mouthBase + env * v.o * 0.85
      springs.mouthW.t = mood.mouthW * (1 + (v.w - 1) * env * 1.3)
      springs.round.t = mood.round + v.r * env
      activity()
    } else {
      springs.mouthOpen.t = mood.mouthBase
      springs.mouthW.t = mood.mouthW
      springs.round.t = mood.round
    }
    if (state === 'idle') springs.happyL.t = springs.happyR.t = pointer.over ? 0.14 : 0
    // Left alone for a while, Duet yawns and dozes off (only where it is allowed to).
    if (opts.doze && (state === 'idle' || state === 'sleepy') && t - lastActivity > 30) {
      setState('sleepy') // Its existing entrance supplies the yawn once.
      later(2.6, () => {
        if (opts.doze && t - lastActivity > 2.4 && state === 'sleepy') setState('asleep')
      })
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────────────────────────
  const zs = [
    { t0: -9, dx: 0 },
    { t0: -9, dx: 0 },
    { t0: -9, dx: 0 }
  ]
  let nextZ = 0
  function renderZs(): void {
    const vis = springs.zz.x
    if (vis > 0.5 && t > nextZ) {
      nextZ = t + 1.7
      const z = zs.reduce((a, b) => (a.t0 < b.t0 ? a : b))
      z.t0 = t
      z.dx = rand(-1, 1)
    }
    zs.forEach((z, i) => {
      const p = (t - z.t0) / 2.8,
        node = el['z' + i]
      if (p >= 1 || vis < 0.01) {
        attr(node, 'opacity', '0')
        return
      }
      const x = 82 + p * 8 + z.dx + Math.sin(p * 5) * 1.2,
        y = 35 - p * 15,
        s = 0.7 + 0.6 * p
      attr(node, 'transform', `translate(${f(x)} ${f(y)}) rotate(-10) scale(${f(s)})`)
      attr(node, 'opacity', f(bump(p) ** 0.8 * 0.8 * vis))
    })
  }

  const cheekClear = { L: 1, R: 1 }
  function render(o: Offsets): void {
    const s = springs,
      hx = s.hx.x + o.yaw,
      hy = s.hy.x + o.pitch
    const sleepy = state === 'sleepy' || state === 'asleep'
    const breath = Math.sin((t * 2 * Math.PI) / (sleepy ? 6 : 4.4)) * (sleepy ? 1.6 : 1)
    const ox = hx * 2.4 * M + noise(t * 0.3, 1) * 0.7 * M + o.ox
    const oy = hy * 1.4 * M + breath * 0.45 * M + s.bob.x + o.oy
    const rot = s.rot.x + o.rot + noise(t * 0.35, 4) * 1.6 * M + hx * 1.2 * M
    const sx = s.sx.x + o.sx - breath * 0.004
    const sy = s.sy.x + o.sy + breath * 0.009
    const lean = s.lean.x
    attr(
      el.head,
      'transform',
      `translate(${f(PIV.x + ox)} ${f(PIV.y + oy)}) rotate(${f(rot)}) scale(${(sx * lean).toFixed(4)} ${(sy * lean).toFixed(4)}) translate(-${PIV.x} -${PIV.y})`
    )

    const bl = blinkValue()
    const open = Math.max(0.2, s.open.x + o.open)
    const gx = clamp(s.gx.x + o.gx, -1.2, 1.2),
      gy = clamp(s.gy.x + o.gy, -1.2, 1.2)
    const speed = Math.hypot(s.gx.v, s.gy.v)
    const blush = clamp(s.blush.x + o.blush)
    const glassy = opts.finish === 'glass'
    for (const side of ['L', 'R'] as const) {
      const sgn = side === 'L' ? -1 : 1
      const v = (k: string): number => s[k + side].x
      const persp = 1 - sgn * hx * 0.06 * M // the eye turned away gets smaller
      const cx = EYE[side].cx + hx * 2.6 * M - sgn * Math.abs(hx) * 0.8 * M
      const close = clamp(bl + o['close' + side] + clamp(v('shut')))
      const hRaw = EYE.h * persp * open * Math.max(0.15, v('eyeH'))
      const h = hRaw * (1 - 0.92 * close)
      const w =
        EYE.w * persp * Math.max(0.3, v('eyeW')) * (1 + close * 0.05) * (1 + (1 - open) * 0.2)
      const cy = EYE[side].cy + hy * 1.6 * M + v('eyeDy') + (hRaw - h) * 0.2
      const n = clamp(v('eyeN'), 1.8, 6)
      const eyeAngle = -sgn * v('eyeRot')
      const d = squircle(cx, cy, w / 2, h / 2, n, side)
      attr(el['eye' + side], 'transform', `rotate(${f(eyeAngle)} ${f(cx)} ${f(cy)})`)
      attr(el['sock' + side], 'd', d)
      attr(el['clip' + side], 'd', d)
      if (glassy) {
        attr(el['grain' + side], 'd', d)
        attr(el['cloud' + side], 'd', d)
      }
      const lid = clamp(v('lid'), 0, 0.9)
      // Pupils: pill or dot, inside the visible eye (below a lowered lid), along the socket's own
      // rounded corners, easing to a stop near the rim: at most ~14% may peek past it.
      const happy = clamp(v('happy') + o.happy + o['happy' + side], 0, 0.85)
      const pScale = Math.max(0.4, v('pupil') + o.pupil) * persp
      const vTop = cy - h / 2 + lid * h * 0.85
      const vH = cy + h / 2 - vTop,
        vCy = vTop + vH / 2
      const pw = Math.min(
        w * 0.42,
        7.6 * pScale * Math.max(0.3, v('pupW')) * (1 + Math.min(0.2, speed * 0.01))
      )
      const ph =
        Math.min(vH * 0.62, 5.4 * pScale * Math.max(0.3, v('pupH'))) * Math.max(0.12, h / hRaw)
      const PEEK = 0.14
      const ax = Math.max(0, w / 2 - pw * (0.5 - PEEK) - 1.8)
      const ay = Math.max(0, vH / 2 - ph * (0.5 - PEEK) - 1.6)
      const r = (Math.abs(gx) ** n + Math.abs(gy) ** n) ** (1 / n)
      const lim = r > 0.72 ? (0.72 + 0.28 * Math.tanh((r - 0.72) / 0.28)) / r : 1
      const px = cx + gx * lim * ax,
        py = vCy + gy * lim * ay
      const pup = el['pup' + side]
      attr(pup, 'x', f(px - pw / 2))
      attr(pup, 'y', f(py - ph / 2))
      attr(pup, 'width', f(pw))
      attr(pup, 'height', f(ph))
      attr(pup, 'rx', f(Math.min(pw, ph) / 2))
      attr(
        pup,
        'opacity',
        f((1 - clamp((happy - 0.3) / 0.25)) * (1 - clamp((close - 0.62) / 0.25)))
      )
      // Top lid: a straight edge lowered into the eye, tilted (mirrored) for sympathy or resolve.
      const tilt = -sgn * v('tilt') * clamp(lid / 0.12)
      const tan = Math.tan((tilt * Math.PI) / 180)
      const ly = cy - h / 2 + lid * h
      attr(
        el['lid' + side],
        'points',
        `${f(cx - 40)},${f(ly - tan * 40 - 0.6)} ${f(cx + 40)},${f(ly + tan * 40 - 0.6)} ${f(cx + 40)},${f(cy - 60)} ${f(cx - 40)},${f(cy - 60)}`
      )
      // Happy: a curve rising from below turns each eye into a smiling arch.
      const ry = h * 0.95
      const cheek = el['cheek' + side]
      attr(cheek, 'cx', f(cx))
      attr(cheek, 'rx', f(w * lerp(1.1, 0.66, clamp(happy / 0.6))))
      attr(cheek, 'ry', f(ry))
      attr(cheek, 'cy', f(cy + h / 2 + ry - happy * h * 1.1 + 0.3))
      // Brows: an arc above the eye, inheriting its tilt and lid; drawn on like a pen stroke.
      const brow = el['brow' + side]
      const amt =
        opts.brows === 'on'
          ? 1 - clamp(v('shut'))
          : opts.brows === 'strong'
            ? clamp(s.brow.x + o.brow)
            : 0
      if (amt > 0.02) {
        const gap = 3.4 + clamp((open - 1) * 16, -1.4, 4) - lid * 3 + happy * 1.2
        const bx = cx + sgn * 1.2,
          by = cy - hRaw / 2 - gap + close * 1.2 + (1 - amt) * 2.2
        const len = w * 0.44,
          arch = 1.3 + happy * 0.8
        attr(
          brow,
          'd',
          `M${f(bx - (sgn * len) / 2)} ${f(by + arch / 2)}Q${f(bx)} ${f(by - arch)} ${f(bx + (sgn * len) / 2)} ${f(by + arch / 2)}`
        )
        attr(
          brow,
          'transform',
          `rotate(${f(eyeAngle)} ${f(cx)} ${f(cy)}) rotate(${f(tilt * 1.5)} ${f(bx)} ${f(by)})`
        )
        attr(brow, 'stroke-dashoffset', f(1 - ease(amt)))
        attr(brow, 'visibility', 'visible')
      } else attr(brow, 'visibility', 'hidden')
      // Cheeks: hatch lines over a faint glow, below the eye's actual lower edge.
      const lowEdge =
        cy +
        (hRaw / 2) * Math.cos((eyeAngle * Math.PI) / 180) +
        Math.abs(Math.sin((eyeAngle * Math.PI) / 180)) * w * 0.35
      const bxC = cx + sgn * 4 * persp,
        byC = Math.max(EYE[side].cy + 17.5 + hy * 1.6 * M, lowEdge + 3.4)
      attr(el['blush' + side], 'cx', f(bxC))
      attr(el['blush' + side], 'cy', f(byC))
      attr(el['lines' + side], 'transform', `translate(${f(bxC)} ${f(byC)}) scale(${f(persp)})`)
      // ...and they step aside for a hand instead of overlapping it.
      let handGap = 99
      for (const hs of ['L', 'R'])
        if (s['handS' + hs].x > 0.3)
          handGap = Math.min(handGap, Math.hypot(s['handX' + hs].x - bxC, s['handY' + hs].x - byC))
      cheekClear[side] = clamp((handGap - 8) / 4)
      // Hands
      const hs = s['handS' + side].x
      const hand = el['hand' + side]
      if (hs < 0.03) {
        attr(hand, 'visibility', 'hidden')
        continue
      }
      attr(hand, 'visibility', 'visible')
      const hX = s['handX' + side].x + o['hX' + side],
        hY = s['handY' + side].x + o['hY' + side]
      const hW = s['handW' + side].x * hs,
        hH = s['handH' + side].x * hs
      attr(hand, 'x', f(hX - hW / 2))
      attr(hand, 'y', f(hY - hH / 2))
      attr(hand, 'width', f(hW))
      attr(hand, 'height', f(hH))
      attr(hand, 'rx', f(Math.min(hW, hH) / 2))
      attr(
        hand,
        'transform',
        `rotate(${f(s['handR' + side].x + o['hR' + side])} ${f(hX)} ${f(hY)})`
      )
    }
    // Both cheeks fade together, so a hand near one never leaves the face lopsided.
    const clear = Math.min(cheekClear.L, cheekClear.R)
    for (const side of ['L', 'R']) {
      attr(el['blush' + side], 'opacity', f(blush * 0.12 * clear))
      attr(el['lines' + side], 'opacity', f(ease(clamp((blush - 0.1) * 1.5)) * 0.75 * clear))
    }
    const mx = 46.7 + hx * 3.4 * M + s.mouthX.x + o.mouthX
    const my = 68.2 + hy * 2.2 * M
    attr(
      el.mouth,
      'd',
      mouthPath(
        mx,
        my,
        5.5 * Math.max(0.4, s.mouthW.x + o.mouthW),
        s.smile.x + o.smile,
        Math.max(0, s.mouthOpen.x + o.mouthOpen),
        clamp(s.round.x + o.round)
      )
    )
    attr(el.mouth, 'transform', `rotate(${f(s.mouthTilt.x + o.mouthTilt)} ${f(mx)} ${f(my)})`)
    renderZs()
    renderTint()
  }

  // ── Loop: fixed 120 Hz spring steps; offset objects are reused, never reallocated ─────────────
  const O: Offsets = {},
    G: Offsets = {}
  const zero = (obj: Offsets): void => {
    for (const k of OFFSETS) obj[k] = 0
  }
  let last = performance.now()
  let raf = 0
  let destroyed = false
  let requested = 0
  function frame(now: number): void {
    if (document.hidden) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt
    behave(dt)
    const steps = Math.ceil(dt * 120),
      h = dt / steps
    for (let i = 0; i < steps; i++)
      for (const sp of springList) {
        sp.v += (sp.k * (sp.t - sp.x) - sp.c * sp.v) * h
        sp.x += sp.v * h
      }
    zero(O)
    MOODS[state].live?.(O)
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i],
        p = (t - a.t0) / a.dur
      if (p >= 1) {
        anims.splice(i, 1)
        continue
      }
      zero(G)
      a.fn(p, G)
      for (const k of OFFSETS) O[k] += G[k] * a.amp
    }
    render(O)
    raf = requestAnimationFrame(frame)
  }

  // ── Input: the cursor (watched, and peeked at while asleep); a click wakes or pokes ──────────
  const onMove = (e: PointerEvent): void => {
    const r = svg.getBoundingClientRect()
    if (!r.width) return
    const dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height * 0.5)
    pointer.x = USER.x + dx / (r.width * 0.55)
    pointer.y = USER.y + dy / (r.height * 0.75) - 0.3
    const reach = Math.hypot(dx / (r.width * 0.5), dy / (r.height * 0.55))
    if (opts.watch === 'off' || (opts.watch === 'near' && reach > 2.6)) return
    pointer.near = reach < 0.95
    pointer.t = t
    activity()
  }
  const onEnter = (): void => {
    if (opts.watch === 'off') return
    pointer.over = true
  }
  const onLeave = (): void => {
    pointer.over = false
    pointer.near = false
    pointer.t = t - 1
  }
  const onClick = (): void => {
    activity()
    if (state === 'asleep') {
      void wake()
      return
    }
    gestures.surprise()
    blinkNow()
    springs.sy.v -= 3 * M
    springs.sx.v += 2.2 * M
    later(0.42, () => gestures.giggle())
  }
  window.addEventListener('pointermove', onMove)
  svg.addEventListener('pointerenter', onEnter)
  svg.addEventListener('pointerleave', onLeave)
  svg.addEventListener('click', onClick)
  const onVisibility = (): void => {
    cancelAnimationFrame(raf)
    if (!document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  // Start already in the given state (no entrance gesture), then run.
  mood = { ...BASE, ...MOODS[start].face }
  svg.dataset.mood = start
  moodHands = MOODS[start].hands || 'hidden'
  for (const k of FACE_KEYS) springs[k].x = springs[k].t = mood[k]
  for (const side of ['L', 'R'])
    for (const k of EYE_KEYS) springs[k + side].x = springs[k + side].t = mood[k + side] ?? mood[k]
  raf = requestAnimationFrame(frame)

  return {
    setState: (next, options) => {
      const request = ++requested
      if (next !== 'asleep' && (state === 'asleep' || waking)) {
        void wake().then(() => {
          if (!destroyed && request === requested) setState(next, options)
        })
      } else setState(next, options)
    },
    wake,
    gesture: (name) => {
      activity()
      gestures[name]()
    },
    setOptions: (next) => {
      // Starting to speak: meet the person's eyes now, not after the glance under way.
      const startsSpeaking = next.speaking === true && !opts.speaking
      Object.assign(opts, next)
      if (startsSpeaking) {
        sac.seq = []
        sac.next = 0
      }
      // Stopped watching: let go of the cursor at once and look as the mood looks.
      if (opts.watch === 'off') {
        pointer.t = -10
        pointer.over = pointer.near = false
      }
      applyOptions()
      tint.last = ''
    },
    destroy: () => {
      destroyed = true
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      timers.forEach((id) => window.clearTimeout(id))
      window.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerenter', onEnter)
      svg.removeEventListener('pointerleave', onLeave)
      svg.removeEventListener('click', onClick)
      svg.innerHTML = ''
    }
  }
}
