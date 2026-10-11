// Duet's motion: calm and native, like macOS. Short and soft; it says what happened (something
// opened, came in, left, moved) and never performs. Every animation in the app uses these tokens and
// presets (with the Motion library), not values of its own. People who ask their system for reduced
// motion get no slides, scales or glides, only quick fades (MotionRoot, at the top of each window).
// The mascot keeps its own CSS animations (components/mascot.css). Spec:
// docs/superpowers/specs/2026-10-12-motion-design.md.
import type { TargetAndTransition, Transition, Variants } from 'motion/react'

/** Seconds: fast for hover and small fades, base for what opens and closes, slow for whole places. */
export const DURATION = { fast: 0.12, base: 0.2, slow: 0.28 }
/** Entering eases out (the app's --ease); leaving eases in. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const EASE_IN = [0.4, 0, 1, 1] as const
/** For what opens: settles at once, no visible overshoot (damping ratio just over 1). */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }

// Leaving runs at about 70% of entering.
const leaving = (duration: number): Transition => ({ duration: duration * 0.7, ease: EASE_IN })

type Preset = { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }

/** Rises in (`distance` px) as it fades in; fades out. */
export function fadeUp(distance = 4, duration = DURATION.base): Preset {
  return {
    initial: { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0, transition: { duration, ease: EASE_OUT } },
    exit: { opacity: 0, transition: leaving(duration) }
  }
}

/** Opens: scales up a little as it fades in, from where it opens (CSS transform-origin); closes
 * the same way, faster. */
export function pop(): Preset {
  return {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1, transition: { ...SPRING, opacity: { duration: DURATION.fast } } },
    exit: { opacity: 0, scale: 0.98, transition: leaving(DURATION.base) }
  }
}

/** Fades in and out. */
export function fade(duration = DURATION.base): Preset {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration, ease: EASE_OUT } },
    exit: { opacity: 0, transition: leaving(duration) }
  }
}

/** A step after (custom 1) or before (-1) the last: it slides in from the side it comes from and the
 * last leaves the other way. Variants, so the leaving step learns the direction as it leaves:
 * <AnimatePresence mode="wait" custom={direction}> around a motion element with variants={SLIDE},
 * custom={direction}, initial="enter", animate="center", exit="leave". */
export const SLIDE: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 24 * direction }),
  center: { opacity: 1, x: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
  leave: (direction: number) => ({ opacity: 0, x: -24 * direction, transition: leaving(DURATION.slow) })
}

/** A layout change (a size or a place) glides there: as an element's whole transition (a highlight
 * moving between rows), or its layout's (GLIDE, beside other transitions). */
export const GLIDING: Transition = { duration: DURATION.base, ease: EASE_OUT }
export const GLIDE: Transition = { layout: GLIDING }

/** Whether the person asked their system for reduced motion (for animations outside Motion: the
 * mascot's opening, its flight to a reply). */
export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
