// The side panel's state, kept in step with the main process: the tab, every line, and the one on screen.
import { useCallback, useEffect, useState } from 'react'
import { say } from '../components/errors'
import type { OverlayLine, PanelTab, Script } from '../../../shared/types'

export type PanelState = {
  tab: PanelTab
  setTab: (tab: PanelTab) => void
  script: Script
  current: number | null
  /** The first state has arrived (until then the tab is a guess, so nothing is shown). */
  loaded: boolean
  /** Why the first state couldn't be read, and asking again. */
  loadError?: string
  reload: () => void
}

export function usePanel(): PanelState {
  const [tab, setTabState] = useState<PanelTab>('script')
  const [script, setScript] = useState<Script>({ source: 'captions', lines: [] })
  const [current, setCurrent] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const reload = useCallback(() => {
    window.duet.panel.getState().then(
      (state) => {
        setTabState(state.tab)
        setScript(state.script)
        setCurrent(state.current)
        setLoaded(true)
        setLoadError(undefined)
      },
      (cause) => setLoadError(say(cause, 'Could not load the lines.'))
    )
  }, [])

  useEffect(() => {
    reload()
    const unsubscribe = [
      window.duet.panel.onTab(setTabState),
      window.duet.panel.onScript(setScript),
      window.duet.panel.onCurrent(setCurrent),
      window.duet.panel.onScriptLine((line: OverlayLine) =>
        setScript((now) => {
          const index = now.lines.findIndex((item) => item.id === line.id)
          const lines = index < 0 ? [...now.lines, line] : now.lines.map((item, at) => (at === index ? line : item))
          return { ...now, lines }
        })
      )
    ]
    return () => unsubscribe.forEach((stop) => stop())
  }, [reload])

  const setTab = (next: PanelTab): void => {
    setTabState(next)
    window.duet.panel.setTab(next)
  }
  return { tab, setTab, script, current, loaded, loadError, reload }
}
