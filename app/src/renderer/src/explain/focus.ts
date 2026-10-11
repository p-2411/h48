// Puts the learner back in the message box, after the frame that shows it (it may have just
// replaced the voice bar), with the caret at `caret` when given.
import type { RefObject } from 'react'

export function focusMessageBox(box: RefObject<HTMLTextAreaElement | null>, caret?: number): void {
  requestAnimationFrame(() => {
    box.current?.focus()
    if (caret !== undefined) box.current?.setSelectionRange(caret, caret)
  })
}
