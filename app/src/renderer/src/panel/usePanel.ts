// The side panel's state, kept in step with the main process: the tab, every line, and the one on screen.
import { useEffect, useState } from 'react'
import type { OverlayLine, PanelTab, Script } from '../../../shared/types'

export type PanelState = { tab: PanelTab; setTab: (tab: PanelTab) => void; script: Script; current: number | null }

export function usePanel(): PanelState {
  const [tab, setTabState] = useState<PanelTab>('script')
  const [script, setScript] = useState<Script>({ source: 'captions', lines: [] })
  const [current, setCurrent] = useState<number | null>(null)

  useEffect(() => {
    window.duet.panel.getState().then((state) => {
      setTabState(state.tab)
      setScript(state.script)
      setCurrent(state.current)
    })
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
  }, [])

  const setTab = (next: PanelTab): void => {
    setTabState(next)
    window.duet.panel.setTab(next)
  }
  return { tab, setTab, script, current }
}
