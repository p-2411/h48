import { useCallback, useEffect, useState } from 'react'
import { defaultLayout, type HomePreferences, type HomeView } from '../../../shared/workspace'
export function useHomeView(): {
  view: HomeView
  ready: boolean
  error?: string
  update: (change: Partial<HomePreferences>) => void
} {
  const [view, setView] = useState<HomeView>({
    appearance: 'light',
    layout: defaultLayout(),
    dark: false,
    platform: 'win32'
  })
  const [ready, setReady] = useState(false),
    [error, setError] = useState<string>()
  useEffect(() => {
    let live = true
    window.duet.home.getView().then(
      (next) => {
        if (live) {
          setView(next)
          setReady(true)
        }
      },
      () => {
        if (live) {
          setError('Could not load the saved layout.')
          setReady(true)
        }
      }
    )
    const off = window.duet.home.onView((next) => {
      if (live) setView(next)
    })
    return () => {
      live = false
      off()
    }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', view.dark)
    document.documentElement.classList.toggle('theme-light', !view.dark)
    document.documentElement.dataset.platform = view.platform
  }, [view.dark, view.platform])
  const update = useCallback((change: Partial<HomePreferences>) => {
    setView((current) => ({
      ...current,
      ...change,
      dark:
        change.appearance === 'dark' ? true : change.appearance === 'light' ? false : current.dark
    }))
    void window.duet.home
      .setView(change)
      .catch(() => setError('Could not save this layout or look.'))
  }, [])
  return { view, ready, error, update }
}
