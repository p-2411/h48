import { useEffect, useState } from 'react'

/** Draws the panel light or dark, as the home base is (home-tokens.css reads the class on <html>);
 * says whether it is dark. */
export function useLook(): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const paint = (look: { dark: boolean }): void => {
      document.documentElement.classList.toggle('theme-dark', look.dark)
      document.documentElement.classList.toggle('theme-light', !look.dark)
      setDark(look.dark)
    }
    paint({ dark: false })
    window.duet.panel.getLook().then(paint, () => undefined)
    return window.duet.panel.onLook(paint)
  }, [])
  return dark
}
