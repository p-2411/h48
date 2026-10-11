// The language learnt, in the home base's top bar: its name, which opens a short menu of the
// languages to pick another (as Settings does). Esc, a pick or a click elsewhere closes it, and the
// focus goes back to the name.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGE_CODES, languageName, type Language } from '../../../shared/languages'
import { pop } from '../components/motion'

export function LanguageMenu({ language }: { language: Language }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const close = (focus: boolean): void => {
    setOpen(false)
    if (focus) toggle.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    wrap.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Esc was for the menu, not for a page behind it.
      event.preventDefault()
      close(true)
    }
    const onPointer = (event: PointerEvent): void => {
      if (!wrap.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])
  const pick = (next: Language): void => {
    if (next !== language) window.duet.setLanguage(next)
    close(true)
  }
  return (
    <div className="language-menu" ref={wrap}>
      <button
        ref={toggle}
        type="button"
        className="language-name"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Learning ${languageName(language)}: change language`}
        onClick={() => setOpen((now) => !now)}
      >
        {languageName(language)}
        <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="language-list" role="menu" aria-label="Language" {...pop()}>
            {LANGUAGE_CODES.map((code) => (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={code === language}
                onClick={() => pick(code)}
              >
                {languageName(code)}
                {code === language && <span aria-hidden="true">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
