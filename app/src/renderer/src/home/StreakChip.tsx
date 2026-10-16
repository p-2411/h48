// The streak in the home base's top bar: a flame and the days in a row. The flame is lit once today's
// session is finished, grey until then. Clicking it opens a pill with this week, a small flame for
// each day kept, and what keeps it going. Esc or a click elsewhere closes it.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { HomeToday, WeekDay } from '../../../shared/home'
import { pop } from '../components/motion'
import { streakNote } from './streak'

/** Sent on window when today's numbers change (the daily session ended), so the bar loads them again. */
export const TODAY_CHANGED = 'duet:today-changed'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SAID: Record<WeekDay['state'], string> = {
  kept: 'kept',
  frozen: 'missed, covered by a freeze',
  missed: 'missed',
  today: 'today, not kept yet',
  ahead: 'still to come'
}

/** The flame; its colours come from the --flame-* tokens, so a grey (unlit) one is just other tokens. */
function Flame({ size = 16 }: { size?: number }): React.JSX.Element {
  const id = useId()
  return (
    <svg className="flame" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--flame-a)" />
          <stop offset="1" stopColor="var(--flame-b)" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="M12 2.5c.6 3.1-1.1 4.9-2.7 6.6C7.7 10.8 6 12.6 6 15.3A6 6 0 0 0 12 21.5a6 6 0 0 0 6-6.2c0-2.4-1.1-4.3-2.6-5.7.1 1.6-.5 2.9-1.6 3.4.4-3.9-.6-7.4-1.8-10.5z"
      />
      <path
        fill="var(--flame-core)"
        d="M12.2 13.2c1.6 1.3 2.4 2.6 2.4 3.9A2.6 2.6 0 0 1 12 19.8a2.6 2.6 0 0 1-2.6-2.7c0-1.5 1.1-2.4 2.8-3.9z"
      />
    </svg>
  )
}

export function StreakChip({ today }: { today?: HomeToday }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const days = today?.streak.days ?? 0
  const lit = !!today?.streak.keptToday
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      toggle.current?.focus()
    }
    const onPointer = (event: PointerEvent): void => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])
  return (
    <div className="streak-menu" ref={wrap}>
      <button
        ref={toggle}
        type="button"
        className={lit ? 'streak is-lit' : 'streak'}
        aria-expanded={open}
        aria-label={`${days} ${days === 1 ? 'day' : 'days'} in a row${lit ? ', kept today' : ', not kept today yet'}. Show this week`}
        onClick={() => setOpen((now) => !now)}
      >
        <Flame />
        <b>{days}</b>
        <span className="streak-unit">{days === 1 ? 'day' : 'days'}</span>
      </button>
      <AnimatePresence>
        {open && today && (
          <motion.div className="streak-pop" role="dialog" aria-label="Your streak" {...pop()}>
            <p className="streak-head">
              <b>{days}</b> {days === 1 ? 'day' : 'days'} in a row
            </p>
            <ol className="streak-week" aria-label="This week">
              {today.week.map((day, i) => (
                <li key={day.day} className={day.state} aria-label={`${DAYS[i]}: ${SAID[day.state]}`}>
                  <span className="streak-dot" aria-hidden="true">
                    {day.state === 'kept' && <Flame size={14} />}
                  </span>
                  <span className="streak-day" aria-hidden="true">
                    {DAYS[i][0]}
                  </span>
                </li>
              ))}
            </ol>
            <p className="streak-note">{streakNote(today.streak)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
