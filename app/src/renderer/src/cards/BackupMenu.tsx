// The ⋯ menu in My cards: back up, restore and export. Each asks for a file; what happened goes to
// `onNotice`, as an error when it failed. Choosing no file says nothing.
import { useState } from 'react'
import { say } from '../components/errors'
import { restoredText } from './backup'

export type Notice = { text: string; error?: boolean }

export function BackupMenu({
  onNotice
}: {
  onNotice: (notice: Notice) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

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
    <div className="menu-wrap">
      <button
        type="button"
        className="btn quiet"
        aria-expanded={open}
        aria-label="More"
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu" onClick={() => setOpen(false)}>
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
