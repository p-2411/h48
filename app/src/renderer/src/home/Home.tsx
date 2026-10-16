// The home window, as designed (canvas board E): a top bar (places, Duet, the language, the
// streak, light and dark, Settings) over a tiling workspace. Every place is always drawn, placed in
// shares of the work area, and CSS alone moves it (workspace.css), so opening, closing, swapping
// and resizing only slide boxes. A closed place waits where it came from: on the hub, its own hub
// tile; otherwise where it last was; Duet shrinks into its icon in the bar.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampSplit,
  DEFAULT_SPLIT,
  defaultLayout,
  fitTiles,
  openTile,
  TILES,
  type TileId,
  type WorkspaceLayout
} from '../../../shared/workspace'
import type { HomeToday } from '../../../shared/home'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DuetMascot } from '../components/duet/DuetMascot'
import type { AnimationCue } from '../components/duet/conversation'
import type { DuetGesture, DuetMood } from '../components/duet/engine'
import { DUET_REACT, type DuetReaction } from '../components/duet/react'
import { Icon } from '../components/Icon'
import { useSettings } from '../components/useSettings'
import { Brush } from './Brush'
import { LanguageMenu } from './LanguageMenu'
import { css, tileRects, type Box, type Divider, type Len } from './layout'
import { SettingsPage } from './SettingsPage'
import { StreakChip, TODAY_CHANGED } from './StreakChip'
import { TalkPage } from './TalkPage'
import type { TalkStart } from './tiles/TalkTile'
import { TodayTile } from './tiles/TodayTile'
import { WatchingTile } from './tiles/WatchingTile'
import { WordsTile } from './tiles/WordsTile'
import { Today } from './Today'
import { useHomeView } from './useHomeView'
import { FloatingWatching, Watching } from './Watching'
import { Flashcards } from './flashcards/Flashcards'

const NAMES = { today: 'Today', watching: 'Watching', words: 'Your words', talk: 'Duet' }
const PLACES = ['today', 'watching', 'words'] as const
const ICONS = { today: 'today', watching: 'video', words: 'words' } as const
/** A tile's header, and its border (one pixel on each side). */
const HEAD = 44,
  EDGE = 2
/** Watching, floating: a small window in a corner of the work area. */
const FLOAT = { w: 300, h: 206 }
const len = (f: number, px = 0): Len => ({ f, px })
const CORNERS: Record<WorkspaceLayout['corner'], Box> = {
  tl: { x: len(0), y: len(0), w: len(0, FLOAT.w), h: len(0, FLOAT.h) },
  tr: { x: len(1, -FLOAT.w), y: len(0), w: len(0, FLOAT.w), h: len(0, FLOAT.h) },
  bl: { x: len(0), y: len(1, -FLOAT.h), w: len(0, FLOAT.w), h: len(0, FLOAT.h) },
  br: { x: len(1, -FLOAT.w), y: len(1, -FLOAT.h), w: len(0, FLOAT.w), h: len(0, FLOAT.h) }
}
const shift = (l: Len, px: number): Len => ({ f: l.f, px: l.px + px })

/** Where a box sits, as CSS variables for workspace.css. Its body is laid out at the box's final
 *  size straight away (in units of the work area), so while the box glides, its page never
 *  reflows: the box only reveals or clips it. */
function place(b: Box): React.CSSProperties {
  return {
    '--l': css(b.x),
    '--t': css(b.y),
    '--w': css(b.w),
    '--h': css(b.h),
    '--bw': css(shift(b.w, -EDGE), 'cqw'),
    '--bh': css(shift(b.h, -EDGE - HEAD), 'cqh')
  } as React.CSSProperties
}

const PageSlot = memo(function PageSlot({
  name,
  children
}: {
  name: string
  children: React.ReactNode
}) {
  return <ErrorBoundary what={name}>{children}</ErrorBoundary>
})

type MenuItem = { label: string; keys: string; run: () => void; icon: React.ReactNode }

export function Home(): React.JSX.Element {
  const { view, ready, error, update } = useHomeView()
  const [layout, setLayout] = useState<WorkspaceLayout>(defaultLayout)
  const [initialized, setInitialized] = useState(false),
    [interacted, setInteracted] = useState(false),
    // Nothing glides until the saved layout is in place, so the window opens as it was left.
    [moving, setMoving] = useState(false)
  const [size, setSize] = useState({ width: 1104, height: 664 }),
    area = useRef<HTMLDivElement>(null)
  const [settings, setSettings] = useState(false),
    [settingsSeen, setSettingsSeen] = useState(false),
    panel = useRef<HTMLElement>(null)
  const [focused, setFocused] = useState<TileId>('today'),
    [menu, setMenu] = useState<{ id: TileId; x: number; y: number }>()
  const [drag, setDrag] = useState<TileId>(),
    [drop, setDrop] = useState<TileId>(),
    [resizing, setResizing] = useState(false),
    [carry, setCarry] = useState<{ x: number; y: number }>()
  const [requestedCard, setRequestedCard] = useState<{ id: string }>()
  const [review, setReview] = useState(false),
    [talkStart, setTalkStart] = useState<TalkStart>()
  const [today, setToday] = useState<HomeToday>(),
    [says, setSays] = useState(true)
  const pointerCleanup = useRef<() => void>(undefined)
  const language = useSettings()?.language

  // Duet in the bar: calm unless something just happened. A feeling plays for a moment and
  // settles back; small things get a one-shot gesture.
  const [mood, setMood] = useState<DuetMood>('idle'),
    [cue, setCue] = useState<AnimationCue>(),
    moodTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const feel = useCallback((next: DuetMood, ms: number) => {
    clearTimeout(moodTimer.current)
    setMood(next)
    moodTimer.current = setTimeout(() => setMood('idle'), ms)
  }, [])
  const gesture = useCallback((name: DuetGesture) => {
    const now = performance.now()
    setCue({ id: now, gesture: name, priority: 1, until: now + 400 })
  }, [])
  useEffect(() => {
    const heard = (event: Event): void => {
      const reaction = (event as CustomEvent<DuetReaction>).detail
      if (reaction === 'right') {
        setSays(true)
        feel('correct', 1400)
      } else if (reaction === 'not-yet') feel('encourage', 1200)
      else if (reaction === 'done') feel('proud', 2600)
    }
    window.addEventListener(DUET_REACT, heard)
    return () => window.removeEventListener(DUET_REACT, heard)
  }, [feel])
  useEffect(
    () => () => {
      clearTimeout(moodTimer.current)
      pointerCleanup.current?.()
    },
    []
  )

  if (ready && !initialized) {
    setInitialized(true)
    if (!interacted)
      setLayout({ ...view.layout, open: fitTiles(view.layout.open, size.width + 16) })
  }
  useEffect(() => {
    if (!initialized) return
    const timer = setTimeout(() => setMoving(true), 60)
    return () => clearTimeout(timer)
  }, [initialized])
  useEffect(() => {
    if (!ready || !initialized || resizing) return
    const t = setTimeout(() => update({ layout }), 200)
    return () => clearTimeout(t)
  }, [layout, ready, resizing, update, initialized])
  useEffect(() => {
    if (!area.current) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
      setLayout((current) => ({ ...current, open: fitTiles(current.open, width + 16) }))
    })
    observer.observe(area.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let live = true
    const load = (): void => {
      void window.duet.home.getToday().then(
        (value) => {
          if (live) setToday(value)
        },
        () => {}
      )
    }
    load()
    // Again on focus, and when the daily session ends (the streak may have just gone up).
    window.addEventListener('focus', load)
    window.addEventListener(TODAY_CHANGED, load)
    return () => {
      live = false
      window.removeEventListener('focus', load)
      window.removeEventListener(TODAY_CHANGED, load)
    }
  }, [])

  const openPlace = useCallback(
    (id: TileId) => {
      setInteracted(true)
      setLayout((current) => openTile(current, id, size.width + 16))
      setFocused(id)
      setMenu(undefined)
      if (id === 'talk') setSays(false)
      else gesture('nod')
    },
    [size.width, gesture]
  )
  const close = useCallback((id: TileId) => {
    setLayout((current) => ({
      ...current,
      open: current.open.filter((x) => x !== id),
      floating: id === 'watching' ? false : current.floating
    }))
    setMenu(undefined)
  }, [])
  const home = useCallback(() => {
    setInteracted(true)
    setLayout((current) => ({ ...current, open: [], floating: false }))
    setMenu(undefined)
    setSettings(false)
  }, [])
  const makeMain = useCallback(
    (id: TileId) => {
      if (id === 'talk') return
      setLayout((current) => ({ ...current, open: [id, ...current.open.filter((x) => x !== id)] }))
      setMenu(undefined)
      gesture('mmhm')
    },
    [gesture]
  )
  const stack = useCallback(() => {
    setLayout((current) => ({ ...current, stacked: !current.stacked }))
    setMenu(undefined)
  }, [])
  const float = useCallback(() => {
    setLayout((current) =>
      current.floating
        ? openTile({ ...current, floating: false }, 'watching', size.width + 16)
        : { ...current, floating: true, open: current.open.filter((x) => x !== 'watching') }
    )
    setMenu(undefined)
  }, [size.width])
  const openToday = useCallback(() => openPlace('today'), [openPlace])
  const openWatching = useCallback(() => openPlace('watching'), [openPlace])
  const openWords = useCallback(() => {
    setReview(false)
    openPlace('words')
  }, [openPlace])
  const openReview = useCallback(() => {
    setReview(true)
    openPlace('words')
  }, [openPlace])
  const showSettings = useCallback((on: boolean) => {
    setSettings(on)
    if (on) setSettingsSeen(true)
  }, [])

  useEffect(
    () =>
      window.duet.cards.onShow((id) => {
        setRequestedCard({ id })
        setReview(false)
        openPlace('words')
      }),
    [openPlace]
  )
  useEffect(
    () =>
      window.duet.home.onPlace(({ place }) => {
        if (place === 'settings') showSettings(true)
        else {
          setReview(place === 'review')
          openPlace(place === 'cards' || place === 'review' ? 'words' : place)
        }
      }),
    [openPlace, showSettings]
  )
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        setMenu(undefined)
        setSettings(false)
        return
      }
      const target = e.target as HTMLElement
      if (settings || target.closest?.('input,textarea,select,[contenteditable="true"]')) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '0') {
        e.preventDefault()
        home()
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const id = TILES[Number(e.key) - 1]
        if (layout.open.includes(id)) close(id)
        else openPlace(id)
      } else if (e.key.toLowerCase() === 'w' && layout.open.includes(focused)) {
        e.preventDefault()
        close(focused)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        makeMain(focused)
      } else if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        stack()
      } else if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        float()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [settings, layout.open, focused, home, openPlace, close, makeMain, stack, float])
  // Settings holds the focus while it's open, and gives it back when it closes.
  useEffect(() => {
    if (!settings) return
    const previous = document.activeElement as HTMLElement
    panel.current?.querySelector<HTMLElement>('button')?.focus()
    const trap = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const nodes = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,a[href],[tabindex="0"]'
        ) ?? []
      )
      const first = nodes[0],
        last = nodes.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', trap)
    return () => {
      window.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [settings])
  useEffect(() => {
    if (menu) area.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
  }, [menu])

  // Where everything is. A closed place waits on its hub tile while the hub shows (so opening one
  // grows the tile you clicked, and Home shrinks each back into its tile), otherwise where it last
  // was; one never opened waits on its hub tile.
  const { rects, hub, dividers } = tileRects(layout)
  const [last, setLast] = useState({ layout, rects })
  if (last.layout !== layout) setLast({ layout, rects: { ...last.rects, ...rects } })
  const remembered = { ...last.rects, ...rects }
  const waiting: Partial<Record<TileId, Box>> = layout.open.length
    ? { ...hub, ...remembered }
    : { ...remembered, ...hub }
  const talkWaits = rects.talk ??
    remembered.talk ?? {
      x: len(layout.split.duet, 4),
      y: len(0),
      w: len(1 - layout.split.duet, -4),
      h: len(1)
    }
  const others = layout.open.filter((id) => id !== 'talk')
  const talkOpen = layout.open.includes('talk')

  const resize = (e: React.PointerEvent, d: Divider): void => {
    e.preventDefault()
    pointerCleanup.current?.()
    setResizing(true)
    const bounds = area.current!.getBoundingClientRect()
    const move = (event: PointerEvent): void =>
      setLayout((current) => {
        const split = { ...current.split }
        const fx = (event.clientX - bounds.left) / bounds.width,
          fy = (event.clientY - bounds.top) / bounds.height
        // Lines inside Duet's column are shares of that column, not of the whole area.
        const within = current.open.includes('talk') && ['beside', 'main4'].includes(d.key)
        if (d.axis === 'y') split[d.key] = clampSplit(fy)
        else split[d.key] = clampSplit(within ? fx / split.duet : fx)
        if (d.key2) split[d.key2] = clampSplit(fy)
        return { ...current, split }
      })
    const end = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setResizing(false)
      pointerCleanup.current = undefined
    }
    pointerCleanup.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  // Watching, floating: carried by its header; let go and it settles into the nearest corner.
  const carryFloat = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    pointerCleanup.current?.()
    const bounds = area.current!.getBoundingClientRect(),
      pane = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    const dx = e.clientX - pane.left,
      dy = e.clientY - pane.top
    let at = { x: pane.left - bounds.left, y: pane.top - bounds.top }
    const move = (p: PointerEvent): void => {
      at = {
        x: Math.max(0, Math.min(bounds.width - FLOAT.w, p.clientX - dx - bounds.left)),
        y: Math.max(0, Math.min(bounds.height - FLOAT.h, p.clientY - dy - bounds.top))
      }
      setCarry(at)
    }
    const end = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setLayout((current) => ({
        ...current,
        corner: `${at.y + FLOAT.h / 2 < bounds.height / 2 ? 't' : 'b'}${at.x + FLOAT.w / 2 < bounds.width / 2 ? 'l' : 'r'}`
      }))
      setCarry(undefined)
      pointerCleanup.current = undefined
    }
    pointerCleanup.current = end
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }
  const floatBox: Box = carry
    ? { x: len(0, carry.x), y: len(0, carry.y), w: len(0, FLOAT.w), h: len(0, FLOAT.h) }
    : CORNERS[layout.corner]

  // The pages get callbacks that never change (they read the latest handlers through a ref), and
  // are built only when what they show changes, so nothing around them (Settings, a menu, another
  // tile) re-renders or reloads the pages already open.
  const latest = useRef({ close, openPlace })
  useEffect(() => {
    latest.current = { close, openPlace }
  })
  const closeToday = useCallback(() => latest.current.close('today'), [])
  const endReview = useCallback(() => setReview(false), [])
  const practise = useCallback((word: string) => {
    setTalkStart({ first: `Help me practise “${word}”.` })
    latest.current.openPlace('talk')
  }, [])
  const pages = useMemo(
    () => ({
      today: <Today onClose={closeToday} />,
      watching: <Watching />,
      talk: <TalkPage start={talkStart} />,
      words: (
        <Flashcards
          requestedCard={requestedCard}
          review={review}
          onReviewEnd={endReview}
          onPractise={practise}
        />
      )
    }),
    [closeToday, endReview, practise, talkStart, requestedCard, review]
  )
  // A page is first built when its place first opens, and kept from then on.
  const [built, setBuilt] = useState<TileId[]>([])
  const fresh = [...layout.open, ...(layout.floating ? (['watching'] as const) : [])].filter(
    (id) => !built.includes(id)
  )
  if (fresh.length) setBuilt([...built, ...new Set(fresh)])

  const menuItems = (id: TileId): (MenuItem | 'rule')[] => {
    const floating = id === 'watching' && layout.floating
    const items: (MenuItem | 'rule')[] = []
    if (!floating && id !== 'talk' && others.length === 2)
      items.push({
        label: layout.stacked ? 'Put side by side' : 'Stack top and bottom',
        keys: 'Ctrl+Alt+S',
        run: stack,
        icon: <path d={layout.stacked ? 'M4 5h16v14H4zM12 5v14' : 'M4 5h16v14H4zM4 12h16'} />
      })
    if (!floating && id !== 'talk' && others.indexOf(id) > 0)
      items.push({
        label: 'Make main',
        keys: 'Ctrl+Enter',
        run: () => makeMain(id),
        icon: <path d="M4 5h16v14H4zM10 5v14" />
      })
    if (id === 'watching')
      items.push({
        label: floating ? 'Put back in the tiles' : 'Pop out as a small window',
        keys: 'Ctrl+Alt+F',
        run: float,
        icon: <path d={floating ? 'M4 5h16v14H4zM4 12h16' : 'M4 5h16v14H4zM12 12h6v5h-6z'} />
      })
    if (items.length) items.push('rule')
    items.push({
      label: 'Close',
      keys: 'Ctrl+W',
      run: () => close(id),
      icon: <path d="M6 6l12 12M18 6L6 18" />
    })
    return items
  }

  return (
    <div
      style={{ visibility: ready ? 'visible' : 'hidden' }}
      className={`home workspace${moving ? '' : ' is-still'}${resizing ? ' is-resizing' : ''}`}
      onPointerDown={() => menu && setMenu(undefined)}
    >
      <header className="workspace-bar">
        <nav className="places" aria-label="Places">
          <button
            type="button"
            aria-label="Home"
            title="Home  Ctrl+0"
            aria-pressed={!layout.open.length}
            onClick={home}
          >
            <Icon name="home" size={16} />
          </button>
          <span className="bar-rule" aria-hidden="true" />
          {PLACES.map((id, i) => (
            <button
              type="button"
              key={id}
              aria-label={NAMES[id]}
              title={`${NAMES[id]}  Ctrl+${i + 1}`}
              aria-pressed={layout.open.includes(id)}
              onClick={() => (layout.open.includes(id) ? close(id) : openPlace(id))}
            >
              <Icon name={ICONS[id]} size={16} />
            </button>
          ))}
        </nav>
        {/* Duet: its face (the mascot, alive) is the button for the chat; open, it turns into a
            speech bubble with a line under it. A coral dot says it has something to say. */}
        <button
          type="button"
          className={`bar-duet${talkOpen ? ' is-open' : ''}`}
          aria-label={talkOpen ? 'Close the chat with Duet' : 'Talk to Duet'}
          title={`${talkOpen ? 'Close the chat with Duet' : 'Talk to Duet'}  Ctrl+4`}
          aria-pressed={talkOpen}
          onClick={() => (talkOpen ? close('talk') : openPlace('talk'))}
        >
          <span className="duet-swap">
            <span className="bar-face">
              <DuetMascot
                state={mood}
                cue={cue}
                width={30}
                finish="flat"
                theme={view.dark ? 'dark' : 'light'}
                watch="near"
                label="Duet"
              />
            </span>
            {talkOpen && (
              <svg
                className="bar-chat"
                width="38"
                height="36"
                viewBox="0 0 38 36"
                aria-hidden="true"
              >
                <path d="M10 3.5h18a7.5 7.5 0 0 1 7.5 7.5v9a7.5 7.5 0 0 1-7.5 7.5H17l-6.5 5.2v-5.2H10A7.5 7.5 0 0 1 2.5 20v-9A7.5 7.5 0 0 1 10 3.5z" />
                <circle cx="12.5" cy="15.5" r="2.3" />
                <circle cx="19" cy="15.5" r="2.3" />
                <circle cx="25.5" cy="15.5" r="2.3" />
              </svg>
            )}
          </span>
          <span className="bar-line" aria-hidden="true" />
          <span className={`bar-dot${says && !talkOpen ? ' is-on' : ''}`} aria-hidden="true" />
        </button>
        <div className="bar-right">
          {language && <LanguageMenu language={language} />}
          <span className="bar-rule" aria-hidden="true" />
          <StreakChip today={today} />
          <button
            type="button"
            className="bar-icon"
            aria-label={view.dark ? 'Light mode' : 'Dark mode'}
            title={view.dark ? 'Light mode' : 'Dark mode'}
            onClick={() => update({ appearance: view.dark ? 'light' : 'dark' })}
          >
            <Icon name={view.dark ? 'sun' : 'moon'} size={15} />
          </button>
          <button
            type="button"
            className="bar-icon"
            aria-label="Settings"
            title="Settings"
            aria-expanded={settings}
            onClick={() => showSettings(!settings)}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </header>
      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      <main className="work-area" ref={area}>
        <div className="work-content" inert={settings}>
          <div
            className={`hub${layout.open.length ? '' : ' is-shown'}`}
            inert={layout.open.length > 0}
          >
            {PLACES.map((id) => (
              <div className="hub-slot" key={id} style={place(hub[id])}>
                {id === 'today' ? (
                  <TodayTile onOpen={openToday} />
                ) : id === 'watching' ? (
                  <WatchingTile onOpen={openWatching} />
                ) : (
                  <WordsTile onOpen={openWords} onReview={openReview} />
                )}
              </div>
            ))}
          </div>
          {TILES.map((id) => {
            const floating = id === 'watching' && layout.floating
            const shown = layout.open.includes(id) || floating
            const box = floating
              ? floatBox
              : (rects[id] ?? (id === 'talk' ? talkWaits : waiting[id]) ?? hub.today)
            const style = place(box)
            // Duet grows out of (and shrinks back into) its icon at the top centre of the window.
            if (id === 'talk')
              (style as Record<string, string>)['--origin'] =
                `calc(${+(50 - box.x.f * 100).toFixed(4)}cqw - ${box.x.px}px) -24px`
            const movable = shown && !floating && id !== 'talk' && others.length > 1
            return (
              <section
                key={id}
                data-place={id}
                aria-label={NAMES[id]}
                aria-hidden={!shown}
                inert={!shown}
                style={style}
                className={[
                  'pane',
                  shown && 'is-shown',
                  id === 'talk' && 'is-talk',
                  floating && 'is-floating',
                  floating && carry && 'is-carried',
                  drag === id && 'is-dragged',
                  drop === id && 'is-target'
                ]
                  .filter(Boolean)
                  .join(' ')}
                onFocusCapture={() => setFocused(id)}
                onPointerDown={() => setFocused(id)}
                onDragOver={(e) => {
                  if (!drag || id === 'talk' || id === drag || !shown) return
                  e.preventDefault()
                  if (drop !== id) setDrop(id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (drag && drag !== id && id !== 'talk')
                    setLayout((current) => {
                      const order = [...current.open],
                        a = order.indexOf(drag),
                        b = order.indexOf(id)
                      if (a >= 0 && b >= 0) [order[a], order[b]] = [order[b], order[a]]
                      return { ...current, open: order }
                    })
                  if (drag && drag !== id && id !== 'talk') gesture('mmhm')
                  setDrag(undefined)
                  setDrop(undefined)
                }}
              >
                <header
                  className="pane-head"
                  draggable={movable}
                  title={
                    floating
                      ? 'Drag to move; it settles into a corner'
                      : movable
                        ? 'Drag to swap places'
                        : undefined
                  }
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', id)
                    setDrag(id)
                  }}
                  onDragEnd={() => {
                    setDrag(undefined)
                    setDrop(undefined)
                  }}
                  onPointerDown={floating ? carryFloat : undefined}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    const bounds = area.current!.getBoundingClientRect()
                    setMenu({
                      id,
                      x: Math.max(0, Math.min(size.width - 236, e.clientX - bounds.left)),
                      y: Math.max(0, Math.min(size.height - 180, e.clientY - bounds.top))
                    })
                  }}
                >
                  {movable && (
                    <svg
                      className="grip"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="9" cy="6" r="1.6" />
                      <circle cx="15" cy="6" r="1.6" />
                      <circle cx="9" cy="12" r="1.6" />
                      <circle cx="15" cy="12" r="1.6" />
                      <circle cx="9" cy="18" r="1.6" />
                      <circle cx="15" cy="18" r="1.6" />
                    </svg>
                  )}
                  <h1>
                    <Brush>{NAMES[id]}</Brush>
                  </h1>
                  <span className="spacer" />
                  {id === 'watching' && shown && (
                    <button
                      type="button"
                      aria-label={floating ? 'Put back in the tiles' : 'Pop out as a small window'}
                      title={floating ? 'Put back in the tiles' : 'Pop out as a small window'}
                      onClick={float}
                    >
                      <Icon name={floating ? 'main' : 'popout'} size={15} />
                    </button>
                  )}
                  {shown && !floating && id !== 'talk' && others.indexOf(id) > 0 && (
                    <button
                      type="button"
                      aria-label="Make this the main tile"
                      title="Make main"
                      onClick={() => makeMain(id)}
                    >
                      <Icon name="main" size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Close ${NAMES[id]}`}
                    title="Close"
                    onClick={() => close(id)}
                  >
                    <Icon name="close" size={15} />
                  </button>
                </header>
                <div className="pane-body body">
                  {built.includes(id) && (
                    <div className="pane-page" hidden={floating}>
                      <PageSlot name={NAMES[id]}>{pages[id]}</PageSlot>
                    </div>
                  )}
                  {floating && <FloatingWatching />}
                </div>
              </section>
            )
          })}
          {dividers.map((d) => (
            <div
              key={`${d.key}-${d.key2 ?? d.axis}`}
              className={`split-handle axis-${d.axis}`}
              role="separator"
              aria-label="Drag to resize"
              title="Drag to resize"
              aria-orientation={d.axis === 'y' ? 'horizontal' : 'vertical'}
              aria-valuenow={Math.round(layout.split[d.key] * 100)}
              aria-valuemin={22}
              aria-valuemax={78}
              tabIndex={0}
              style={
                d.axis === 'xy'
                  ? { left: `calc(${d.at * 100}% - 11px)`, top: `calc(${d.at2! * 100}% - 11px)` }
                  : d.axis === 'x'
                    ? { left: `calc(${d.at * 100}% - 4px)` }
                    : {
                        top: `calc(${d.at * 100}% - 4px)`,
                        left: d.from ? `calc(${d.from * 100}% + 4px)` : 0,
                        right:
                          d.to !== undefined && d.to < 1 ? `calc(${(1 - d.to) * 100}% + 4px)` : 0
                      }
              }
              onPointerDown={(e) => resize(e, d)}
              onDoubleClick={() =>
                setLayout((current) => ({
                  ...current,
                  split: {
                    ...current.split,
                    [d.key]: DEFAULT_SPLIT[d.key],
                    ...(d.key2 ? { [d.key2]: DEFAULT_SPLIT[d.key2] } : {})
                  }
                }))
              }
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key))
                  return
                e.preventDefault()
                const key =
                  d.axis === 'xy' && ['ArrowUp', 'ArrowDown'].includes(e.key) ? d.key2! : d.key
                setLayout((current) => ({
                  ...current,
                  split: {
                    ...current.split,
                    [key]:
                      e.key === 'Home'
                        ? DEFAULT_SPLIT[key]
                        : clampSplit(
                            current.split[key] +
                              (['ArrowRight', 'ArrowDown'].includes(e.key) ? 0.02 : -0.02)
                          )
                  }
                }))
              }}
            >
              <span className="grip" />
            </div>
          ))}
          {menu && (
            <div
              role="menu"
              aria-label={`${NAMES[menu.id]} options`}
              className="tile-menu"
              style={{ left: menu.x, top: menu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {menuItems(menu.id).map((item, i) =>
                item === 'rule' ? (
                  <div key={`rule-${i}`} className="tile-menu-rule" />
                ) : (
                  <button type="button" role="menuitem" key={item.label} onClick={item.run}>
                    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                      {item.icon}
                    </svg>
                    <span>{item.label}</span>
                    <kbd>{item.keys}</kbd>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </main>
      {/* Settings: a panel the height of the work area, sliding in from the right over a faint
          scrim, and back out the same way. */}
      <div
        className={`settings-scrim${settings ? ' is-shown' : ''}`}
        aria-hidden="true"
        onClick={() => setSettings(false)}
      />
      <aside
        ref={panel}
        className={`settings-panel${settings ? ' is-shown' : ''}`}
        role="dialog"
        aria-modal={settings}
        aria-label="Settings"
        aria-hidden={!settings}
        inert={!settings}
      >
        <header className="pane-head" data-place="settings">
          <h1>
            <Brush>Settings</Brush>
          </h1>
          <span className="spacer" />
          <button
            type="button"
            aria-label="Close settings"
            title="Close"
            onClick={() => setSettings(false)}
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        <div className="body">
          {settingsSeen && (
            <SettingsPage
              appearance={view.appearance}
              onAppearance={(appearance) => update({ appearance })}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
