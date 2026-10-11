// The home base: a sidebar of places and the place shown (Talk is a free conversation with Duet). Main can ask for a place (Home opened from
// the Dock, the menu bar, the strip's ⚙, a card's "Open in My cards"); Review shows inside Cards.
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { HomePlace } from '../../../shared/home'
import { MyCards } from '../cards/MyCards'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { DURATION, fadeUp } from '../components/motion'
import { Review } from '../review/Review'
import { SettingsPage } from './SettingsPage'
import { TalkPage } from './TalkPage'
import { Today } from './Today'
import { Watching } from './Watching'

const PLACES: { place: Exclude<HomePlace, 'review'>; label: string }[] = [
  { place: 'today', label: 'Today' },
  { place: 'talk', label: 'Talk' },
  { place: 'watching', label: 'Watching' },
  { place: 'cards', label: 'Cards' },
  { place: 'settings', label: 'Settings' }
]

function Place({
  place,
  onPlace
}: {
  place: HomePlace
  onPlace: (place: HomePlace) => void
}): React.JSX.Element {
  if (place === 'today') return <Today onReview={() => onPlace('review')} />
  if (place === 'talk') return <TalkPage />
  if (place === 'watching') return <Watching />
  if (place === 'cards') return <MyCards onReview={() => onPlace('review')} />
  if (place === 'settings') return <SettingsPage />
  return (
    <main className="home-page">
      <h1>Review</h1>
      <Review onEnd={() => onPlace('cards')} />
    </main>
  )
}

export function Home(): React.JSX.Element {
  const [place, setPlace] = useState<HomePlace>('today')
  useEffect(() => window.duet.home.onPlace((message) => setPlace(message.place)), [])
  // A button inside a page that switched places (Review on Today, End session) is gone, and the focus
  // with it: the new page's title takes it, so the keyboard and a screen reader carry on from there.
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    const title = content.current?.querySelector<HTMLElement>('h1')
    if (!title) return
    title.tabIndex = -1
    title.focus()
  }, [place])
  // Review is part of Cards in the sidebar.
  const section = place === 'review' ? 'cards' : place
  return (
    <div className="home">
      <nav className="home-nav" aria-label="Duet">
        <span className="home-brand">Duet</span>
        {PLACES.map((item) => (
          <button
            key={item.place}
            type="button"
            aria-current={section === item.place ? 'page' : undefined}
            onClick={() => setPlace(item.place)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {/* Keyed by place, so a place that broke can be left and come back fresh. */}
      <div className="home-place" ref={content}>
        {/* Each place fades and rises in as it's switched to. */}
        <motion.div key={place} className="home-place-page" {...fadeUp(8, DURATION.slow)}>
          <ErrorBoundary what="This page">
            <Place place={place} onPlace={setPlace} />
          </ErrorBoundary>
        </motion.div>
      </div>
    </div>
  )
}
