// Small pieces the flashcards page shares: its icons, playing Duet's voice, and the finish's paper
// confetti. (Its small components are in Entry.tsx.)

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

export const icons = {
  play: (size = 10) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  sound: (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      strokeWidth="2.2"
      {...stroke}
      aria-hidden="true"
    >
      <path d="M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  ),
  chev: (
    <svg
      className="chev"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      strokeWidth="2.2"
      {...stroke}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  back: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      strokeWidth="2.2"
      {...stroke}
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  arrow: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      strokeWidth="2.2"
      {...stroke}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  mic: (
    <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  pan: (
    <svg width="54" height="34" viewBox="0 0 54 34" aria-hidden="true">
      <circle cx="20" cy="17" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M32 17h19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

/** Plays a clip of Duet's voice; `rate` below 1 is slower. Resolves when it starts. */
export async function playClip(
  clip: { data: Uint8Array; mimeType: string },
  rate = 1
): Promise<void> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(clip.data)], { type: clip.mimeType }))
  const audio = new Audio(url)
  audio.playbackRate = rate
  audio.preservesPitch = true
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
  await audio.play()
}

/** "1:25": seconds into a video. */
export function mmss(seconds?: number): string {
  if (seconds === undefined) return ''
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** "4 times", "twice", "once". */
export function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`
}

/** A handful of paper slips and curls in the step colours, falling and turning once (about four
 * seconds), then gone. Nothing when the learner asks for less motion. */
export function confetti(canvas: HTMLCanvasElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const box = canvas.getBoundingClientRect()
  const ratio = devicePixelRatio || 1
  canvas.width = box.width * ratio
  canvas.height = box.height * ratio
  const context = canvas.getContext('2d')
  if (!context) return () => {}
  context.scale(ratio, ratio)
  const style = getComputedStyle(canvas)
  const colours = ['--d-heard', '--d-known', '--d-say', '--d-use', '--w-new'].map(
    (name) => style.getPropertyValue(name).trim() || '#e8b923'
  )
  const random = (a: number, b: number): number => a + Math.random() * (b - a)
  const bits = Array.from({ length: 34 }, (_, i) => ({
    x: box.width / 2 + random(-box.width * 0.32, box.width * 0.32),
    y: random(-box.height * 0.5, -10),
    w: random(5, 10),
    h: random(3, 6),
    colour: colours[i % colours.length],
    curl: Math.random() < 0.25,
    fall: random(38, 70),
    sway: random(14, 34),
    beat: random(1.2, 2.4),
    phase: random(0, 6.3),
    spin: random(-3, 3),
    turn: random(0, 6.3)
  }))
  const LASTS = 4.2
  const start = performance.now()
  let frame = 0
  const draw = (now: number): void => {
    const t = (now - start) / 1000
    context.clearRect(0, 0, box.width, box.height)
    const fade = Math.max(0, Math.min(1, (LASTS - t) / 0.8))
    for (const bit of bits) {
      const y = bit.y + bit.fall * t
      const x = bit.x + Math.sin(t * bit.beat + bit.phase) * bit.sway
      // Paper tumbling: it narrows as it turns.
      const tumble = Math.abs(Math.cos(t * bit.beat * 1.7 + bit.phase))
      context.save()
      context.globalAlpha = fade * 0.9
      context.translate(x, y)
      context.rotate(bit.turn + bit.spin * t)
      context.fillStyle = bit.colour
      context.strokeStyle = bit.colour
      if (bit.curl) {
        context.lineWidth = 2
        context.lineCap = 'round'
        context.beginPath()
        context.arc(0, 0, bit.w * 0.6, 0, Math.PI * 0.9 * tumble + 0.6)
        context.stroke()
      } else context.fillRect(-bit.w / 2, (-bit.h / 2) * tumble, bit.w, bit.h * tumble + 0.6)
      context.restore()
    }
    if (t < LASTS) frame = requestAnimationFrame(draw)
    else context.clearRect(0, 0, box.width, box.height)
  }
  frame = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(frame)
}
