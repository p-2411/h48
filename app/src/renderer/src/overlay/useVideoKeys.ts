// The video keeps its keyboard: a click on the strip gives the strip window the focus, so YouTube's
// keys (← →, Space…) would stop working. After a click the strip hands the keyboard back to the
// browser, unless the click was into a box to type in (a checkpoint answer). Until it is back (or
// if Windows keeps it here), YouTube's playback keys pressed on the strip are passed to the video.
import { useEffect } from 'react'
import type { VideoKey } from '../../../shared/types'

const KEYS: Record<string, VideoKey> = {
  ArrowLeft: 'back5',
  ArrowRight: 'forward5',
  j: 'back10',
  l: 'forward10',
  k: 'toggle',
  ' ': 'toggle'
}

/** A box being typed in keeps the keyboard and its keys. */
function typing(element: Element | null): boolean {
  return !!element?.closest?.('input, textarea, select, [contenteditable="true"]')
}

export function useVideoKeys(): void {
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      // Taken by one of Duet's own controls, or with a modifier (not a playback key then).
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (typing(event.target as Element | null)) return
      const action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action) return
      event.preventDefault()
      window.duet.videoKey(action)
    }
    // After the click has done its work (a button may open something that takes the focus). Not
    // while a checkpoint is offered or open: its answer box takes the keyboard as it opens, and
    // handing it back in between would make the window lose and take the focus again.
    const clicked = (): void => {
      setTimeout(() => {
        if (typing(document.activeElement) || document.querySelector('.dock.asking')) return
        window.duet.releaseKeyboard()
      }, 0)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', clicked)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', clicked)
    }
  }, [])
}
