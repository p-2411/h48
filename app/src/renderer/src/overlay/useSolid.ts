// Clicks pass through the overlay window to the video, except where Duet draws something: the
// window forwards pointer movement even while letting clicks through, and this tells the main
// process whenever the pointer moves onto or off anything marked data-solid.
import { useEffect } from 'react'

export function useSolid(): void {
  useEffect(() => {
    let solid = false
    const set = (next: boolean): void => {
      if (next === solid) return
      solid = next
      window.duet.setSolid(next)
    }
    const move = (event: MouseEvent): void => set(!!(event.target as Element | null)?.closest?.('[data-solid]'))
    const leave = (): void => set(false)
    window.addEventListener('mousemove', move)
    document.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('mousemove', move)
      document.removeEventListener('mouseleave', leave)
      // Gone (the strip crashed or reloaded): the window lets clicks through to the video again.
      window.duet.setSolid(false)
    }
  }, [])
}
