// Duet, alive: the new mascot (squircle eyes, pill pupils, offset smile) in frosted glass. React
// mounts the SVG once and hands it to the engine (engine.ts), which animates it outside React;
// props only tell it what Duet is doing.
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import './duet.css'
import type { MascotState } from '../Mascot'
import {
  createDuet,
  type DuetEngine,
  type DuetMood,
  type DuetOptions,
  type DuetTone
} from './engine'
import { createSpeechLevel } from './speech'
import type { AnimationCue } from './conversation'

/** The app's mascot states, in the new mascot's moods (the rest are its own names). */
const FROM_APP: Partial<Record<MascotState, DuetMood>> = {
  success: 'correct',
  correction: 'almost'
}

export function DuetMascot({
  state,
  tone,
  width = 120,
  finish = 'glass',
  theme = 'dark',
  brows = 'strong',
  wake = false,
  doze = false,
  watch = 'window',
  speechAudio,
  speaking,
  cue,
  label = 'Duet'
}: {
  state: MascotState | DuetMood
  tone?: DuetTone
  /** Width in px; the face is 100 × 66 (hands and the sleeping z's may reach a little outside). */
  width?: number
  finish?: DuetOptions['finish']
  theme?: DuetOptions['theme']
  brows?: DuetOptions['brows']
  /** Start asleep and wake up on mount (crouch, stretch, eyes open), then go to `state`. */
  wake?: boolean
  /** Doze off after 30 s with nothing happening. */
  doze?: boolean
  /** Follow the cursor anywhere in the window, or only when it comes close. */
  watch?: DuetOptions['watch']
  /** Duet's voice as it plays: while speaking, the mouth follows its loudness. */
  speechAudio?: RefObject<HTMLAudioElement | null>
  speaking?: boolean
  cue?: AnimationCue
  label?: string
}): React.JSX.Element {
  const svg = useRef<SVGSVGElement>(null)
  const engine = useRef<DuetEngine | null>(null)
  const mood: DuetMood = FROM_APP[state as MascotState] ?? (state as DuetMood)
  const current = useRef({ mood, tone, speaking, cue, speechAudio })
  const waking = useRef(false)
  const appliedCue = useRef<number | undefined>(undefined)
  const apply = useCallback((): void => {
    const duet = engine.current
    if (!duet || waking.current) return
    const next = current.current
    duet.setOptions({ speaking: next.speaking })
    duet.setState(next.mood, { tone: next.cue?.tone ?? next.tone })
    if (
      next.cue?.gesture &&
      next.cue.id !== appliedCue.current &&
      performance.now() < next.cue.until
    ) {
      duet.gesture(next.cue.gesture)
    }
    appliedCue.current = next.cue?.id
  }, [])
  useEffect(() => {
    current.current = { mood, tone, speaking, cue, speechAudio }
  })
  // What the engine starts with; later changes go through the effects below.
  const first = useRef({ mood, tone, finish, theme, brows, wake, doze, watch, speechAudio })

  useEffect(() => {
    const node = svg.current
    if (!node) return
    const init = first.current
    const voice = createSpeechLevel(() => current.current.speechAudio?.current)
    const duet = createDuet(
      node,
      {
        finish: init.finish,
        theme: init.theme,
        brows: init.brows,
        doze: init.doze,
        watch: init.watch,
        speechLevel: () => voice.read()
      },
      init.wake ? 'asleep' : init.mood
    )
    engine.current = duet
    let disposed = false
    appliedCue.current = undefined
    waking.current = init.wake
    if (init.wake) {
      void duet.wake().then(() => {
        if (disposed) return
        waking.current = false
        apply()
      })
    } else apply()
    const visibility = (): void => {
      if (document.hidden) voice.dispose()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', visibility)
      engine.current = null
      duet.destroy()
      voice.dispose()
    }
  }, [apply])

  useEffect(() => {
    apply()
  }, [mood, tone, speaking, cue, apply])

  useEffect(() => {
    engine.current?.setOptions({ finish, theme, brows, doze, watch })
  }, [finish, theme, brows, doze, watch])

  return (
    <svg
      ref={svg}
      className="duet-alive"
      viewBox="0 17 100 66"
      width={width}
      height={Math.round(width * 0.66)}
      role="img"
      aria-label={label}
    />
  )
}
