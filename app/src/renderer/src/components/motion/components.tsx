// Duet's motion components: the root each window starts with, and a number that counts up. The
// tokens and presets are in presets.ts.
import { animate, MotionConfig } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { EASE_OUT, reducedMotion } from './presets'

/** A number counting up to `value` (the streak on the daily session's end); just the number for
 * people who ask for reduced motion. */
export function CountUp({ value }: { value: number }): React.JSX.Element {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0))
  useEffect(() => {
    if (reducedMotion()) return
    const controls = animate(0, value, { duration: 0.6, ease: EASE_OUT, onUpdate: (now) => setShown(Math.round(now)) })
    return () => controls.stop()
  }, [value])
  return <>{reducedMotion() ? value : shown}</>
}

/** At the top of each window: Motion follows the system's reduced-motion setting there. */
export function MotionRoot({ children }: { children: ReactNode }): React.JSX.Element {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
