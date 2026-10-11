// The ⋯ menu in My cards: back up, restore and export. Each asks for a file; what happened goes to
// `onNotice`, as an error when it failed. Choosing no file says nothing.
import { useEffect, useRef, useState } from 'react'
import { say } from '../components/errors'
import { restoredText } from './backup'
import { Icon } from '../components/Icon'

export type Notice = { text: string; error?: boolean }

export function BackupMenu({
  onNotice
}: {
  onNotice: (notice: Notice) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  // Closed by Escape or a choice, focus goes back to ⋯; closed by a click elsewhere, it stays
  // where that click put it.
  const close = (): void => {
    setOpen(false)
    toggle.current?.focus()
  }
  // Opened, the menu takes the focus on its first item; the arrow keys move between items.
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])
  const moveFocus = (event: React.KeyboardEvent): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
    items[next]?.focus()
  }
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Esc was for the menu, not for the page behind it.
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

  async function file<T>(
    work: () => Promise<T | undefined>,
    done: (result: T) => string
  ): Promise<void> {
    try {
      const result = await work()
      if (result !== undefined) onNotice({ text: done(result) })
    } catch (failure) {
      onNotice({ text: say(failure, 'That did not work.'), error: true })
    }
  }

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        ref={toggle}
        type="button"
        className="btn quiet"
        aria-expanded={open}
        aria-label="More"
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="menu" role="menu" ref={menu} onClick={close} onKeyDown={moveFocus}>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              file(window.duet.cards.exportBackup, (path) => `Backup saved to ${path}.`)
            }
          >
            Back up cards…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => file(window.duet.cards.restoreBackup, restoredText)}
          >
            Restore a backup…
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              file(
                window.duet.cards.exportText,
                (path) => `Exported to ${path}. The schedule is not included.`
              )
            }
          >
            Export as text…
          </button>
          <p className="faint">Cards are kept on this computer only. Back up to keep a copy.</p>
        </div>
      )}
    </div>
  )
}
