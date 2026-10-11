// The home base: a hub of glass tiles (Today, Continue watching, Your words, Talk to Duet) under a
// top bar with the gear. A tile grows into its page and shrinks back into it (useSurface); ‹ Home or
// Esc goes back. Main can ask for a place (Home opened from the Dock, the menu bar, the strip's ⚙,
// a card's "Open in Your words"): it grows out of its tile the same way. Spec:
// docs/superpowers/specs/2026-10-12-home-redesign-design.md.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomePlace } from '../../../shared/home'
import { languageName } from '../../../shared/languages'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Icon } from '../components/Icon'
import { DURATION, fadeUp } from '../components/motion'
import { useSettings } from '../components/useSettings'
import { SettingsPage } from './SettingsPage'
import { TalkPage } from './TalkPage'
import { TalkTile, type TalkStart } from './tiles/TalkTile'
import { TodayTile } from './tiles/TodayTile'
import { WatchingTile } from './tiles/WatchingTile'
import { WordsTile } from './tiles/WordsTile'
import { Today } from './Today'
import { useSurface } from './useSurface'
import { Watching } from './Watching'
import { YourWords } from './words/YourWords'

type Page = 'today' | 'watching' | 'words' | 'talk' | 'settings'
/** A page open over the hub: Your words can open straight into Review, Talk with a first message or
 * with voice on. */
type Opened = { page: Page; review?: boolean; talk?: TalkStart }

/** The page main asks for, by its older place names (Cards and Words are both Your words now). */
function pageFor(place: HomePlace): Opened {
  if (place === 'cards' || place === 'words') return { page: 'words' }
  if (place === 'review') return { page: 'words', review: true }
  return { page: place }
}

/** The element a page grows out of: its tile, or the gear for Settings. */
function originOf(root: HTMLElement, page: Page): HTMLElement | null {
  return root.querySelector<HTMLElement>(page === 'settings' ? '.home-gear' : `[data-tile="${page}"]`)
}

// Esc goes back to the hub, unless it's for something else: a popover, or a box with words in it.
function escapeIsFree(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false
  const target = event.target as HTMLElement | null
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return !target.value
  return true
}

function OpenPage({
  opened,
  onClose,
  onOpen
}: {
  opened: Opened
  onClose: () => void
  onOpen: (opened: Opened) => void
}): React.JSX.Element {
  switch (opened.page) {
    case 'today':
      return <Today onClose={onClose} />
    case 'watching':
      return <Watching />
    case 'words':
      return (
        <YourWords
          review={opened.review}
          onReviewEnd={() => onOpen({ page: 'words' })}
          onPractise={(word) => onOpen({ page: 'talk', talk: { first: `Help me practise “${word}”.` } })}
        />
      )
    case 'talk':
      return <TalkPage start={opened.talk} />
    case 'settings':
      return <SettingsPage />
  }
}

export function Home(): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const { stage, grow, shrink, from, retarget } = useSurface(root, surface, page)
  const [opened, setOpened] = useState<Opened>()
  const language = useSettings()?.language
  // What's open, for the listeners below (they're set up once).
  const openedNow = useRef(opened)
  useEffect(() => {
    openedNow.current = opened
  }, [opened])

  /** Opens a page: grown out of `origin` (its tile, by default), or, with a page already open, in its
   * place (it then shrinks back into its own tile). */
  const open = useCallback(
    (next: Opened, origin?: HTMLElement | null) => {
      const element = origin ?? (root.current && originOf(root.current, next.page))
      if (openedNow.current) {
        if (element) retarget(element)
        return setOpened(next)
      }
      if (element) void grow(element, () => setOpened(next))
      else setOpened(next)
    },
    [grow, retarget]
  )
  const close = useCallback(() => {
    void shrink(() => setOpened(undefined)).then(() => {
      // Back to where the page came from, for the keyboard and screen readers.
      const origin = from.current
      ;(origin?.querySelector<HTMLElement>('.tile-title') ?? origin)?.focus()
    })
  }, [shrink, from])

  useEffect(() => window.duet.home.onPlace((message) => open(pageFor(message.place))), [open])
  useEffect(() => {
    // Decided once every other key handler has had its turn (the shortcut recorder, a menu), so Esc
    // that one of them used isn't also taken as Back.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      window.setTimeout(() => {
        if (openedNow.current && escapeIsFree(event)) close()
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  // The page's title takes the focus when it opens, or when another page takes its place.
  const openPage = opened?.page
  useEffect(() => {
    if (stage !== 'open' || !openPage) return
    const title = page.current?.querySelector<HTMLElement>('h1')
    if (!title) return
    title.tabIndex = -1
    title.focus()
  }, [stage, openPage])

  const hidden = stage === 'open'
  return (
    <div className={`home stage-${stage}`} ref={root}>
      <header className="home-bar" inert={hidden}>
        <span className="home-brand">Duet</span>
        {language && <span className="faint">{languageName(language)}</span>}
        <span className="spacer" />
        <button type="button" className="home-gear" aria-label="Settings" onClick={(event) => open({ page: 'settings' }, event.currentTarget)}>
          <Icon name="settings" size={15} />
        </button>
      </header>
      <div className="hub" inert={hidden}>
        <TodayTile onOpen={(tile) => open({ page: 'today' }, tile)} />
        <WatchingTile onOpen={(tile) => open({ page: 'watching' }, tile)} />
        <WordsTile onOpen={(tile) => open({ page: 'words' }, tile)} onReview={(tile) => open({ page: 'words', review: true }, tile)} />
        <TalkTile onOpen={(tile, start) => open({ page: 'talk', talk: start }, tile)} />
      </div>
      {stage !== 'closed' && <div className="home-surface" ref={surface} aria-hidden="true" />}
      <AnimatePresence>
        {opened && (
          // Keyed by page, so a page that broke can be left and come back fresh.
          <motion.div key={opened.page} className="home-open" ref={page} {...fadeUp(8, DURATION.slow)}>
            <button type="button" className="btn home-back" onClick={close}>
              ‹ Home
            </button>
            <ErrorBoundary what="This page">
              <OpenPage opened={opened} onClose={close} onOpen={open} />
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
