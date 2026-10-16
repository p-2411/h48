// The flashcards page in the Your words place (docs/design/cards/flashcards-page.md): a switch for
// Review · Words · Collections, and a ? that replays How cards work. Review runs its sessions inside
// the page; every session has Back to wherever it started (Review, a word, Collections).
// The Your words tile's Review N opens it straight into today's review; a card shown from elsewhere
// ("Open in Your words") opens its word in Words.
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CardKind,
  CollectionView,
  FlashcardsPrefs,
  SessionScope,
  Step,
  TodayView,
  VideoGroup
} from '../../../../shared/flashcards'
import { wordKey } from '../../../../shared/knowledge'
import { BackupMenu } from '../../cards/BackupMenu'
import { useSettingsState } from '../../components/useSettings'
import { useWordsData } from '../words/useWordsData'
import { Collections } from './Collections'
import { Guide } from './Guide'
import { TOUR, type TourStop } from './tour'
import { MakeCard } from './MakeCard'
import { Session } from './Session'
import { Today } from './Today'
import {
  sampleApi,
  sampleCollections,
  sampleToday,
  sampleVideos,
  sampleWords,
  SAMPLE_WORD
} from './sample'
import { Words } from './Words'
import './flashcards.css'

type View = 'review' | 'words' | 'collections'
type Notice = { text: string; error?: boolean; undo?: () => void }
/** What Review shows: today, a session (and where Back goes), or Make a card. */
type Mode =
  | { kind: 'today' }
  | { kind: 'make'; word?: string }
  | { kind: 'session'; scope: SessionScope; from: View; backTo: string }

const VIEWS: [View, string][] = [
  ['review', 'Review'],
  ['words', 'Words'],
  ['collections', 'Collections']
]

export function Flashcards({
  review,
  requestedCard,
  onReviewEnd,
  onPractise
}: {
  /** Opens straight into today's review; its end calls `onReviewEnd`. */
  review?: boolean
  requestedCard?: { id: string }
  onReviewEnd?: () => void
  /** Ask Duet: opens Talk about a word. */
  onPractise: (word: string) => void
}): React.JSX.Element {
  const { settings, error: settingsError } = useSettingsState()
  const language = settings?.language
  const words = useWordsData(language)
  const api = window.duet.flashcards
  const [view, setView] = useState<View>('review')
  const [mode, setMode] = useState<Mode>({ kind: 'today' })
  const [selected, setSelected] = useState<string>()
  const [step, setStep] = useState<Step>()
  const [flash, setFlash] = useState<string>()
  const [notice, setNotice] = useState<Notice>()
  const [prefs, setPrefs] = useState<FlashcardsPrefs>()
  // The tour: which stop it's on (none: not running), its sample, and the page to put back after it.
  const [tour, setTour] = useState<number>()
  const [sample, setSample] = useState<ReturnType<typeof sampleApi>>()
  const before = useRef<{ view: View; mode: Mode; selected?: string; step?: Step }>(undefined)
  const [today, setToday] = useState<TodayView>()
  const [piles, setPiles] = useState<CollectionView[]>()
  const [videos, setVideos] = useState<VideoGroup[]>()

  // The first time Review is opened, How cards work opens over it.
  useEffect(() => {
    api.prefs().then(
      (kept) => {
        setPrefs(kept)
        if (!kept.guideSeen) openTour()
      },
      () => setPrefs({ guideSeen: true, kindsSeen: [] })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const savePrefs = useCallback(
    (change: Partial<FlashcardsPrefs>) => {
      setPrefs((now) => now && { ...now, ...change })
      api.setPrefs(change).then(setPrefs, () => undefined)
    },
    [api]
  )
  /** Moves the page to a stop of the tour. */
  const showStop = (stop: TourStop): void => {
    setNotice(undefined)
    setFlash(undefined)
    setView(stop.view)
    setMode(
      stop.mode === 'session'
        ? { kind: 'session', scope: { kind: 'today' }, from: 'review', backTo: 'Review' }
        : { kind: 'today' }
    )
    if (stop.view === 'words') {
      setSelected(SAMPLE_WORD)
      setStep(undefined)
    }
  }
  function openTour(): void {
    // A session can't keep going under the tour: what's put back is Review or the view it was in.
    before.current = {
      view,
      mode: mode.kind === 'session' ? { kind: 'today' } : mode,
      selected,
      step
    }
    setSample(sampleApi())
    setTour(0)
    showStop(TOUR[0])
  }
  const moveTour = (at: number): void => {
    setTour(at)
    showStop(TOUR[at])
  }
  /** Ends the tour: the learner's own page again, where they were (Skip) or on Review (finished). */
  const endTour = (finished: boolean): void => {
    const was = before.current
    setTour(undefined)
    setSample(undefined)
    setView(finished || !was ? 'review' : was.view)
    setMode(finished || !was ? { kind: 'today' } : was.mode)
    setSelected(was?.selected)
    setStep(was?.step)
    if (!prefs?.guideSeen) savePrefs({ guideSeen: true })
  }
  const onKindSeen = useCallback(
    (kind: CardKind) => {
      if (prefs && !prefs.kindsSeen.includes(kind))
        savePrefs({ kindsSeen: [...prefs.kindsSeen, kind] })
    },
    [prefs, savePrefs]
  )

  // What Review and Collections show, loaded again whenever the words or cards were.
  useEffect(() => {
    if (!language) return
    let live = true
    api.today(language).then(
      (found) => live && setToday(found),
      () => undefined
    )
    if (view === 'collections') {
      api.collections().then(
        (found) => live && setPiles(found),
        () => undefined
      )
      api.videos(language).then(
        (found) => live && setVideos(found),
        () => undefined
      )
    }
    return () => {
      live = false
    }
  }, [api, language, view, words.data])

  const startSession = (scope: SessionScope, from: View, backTo: string): void => {
    setView('review')
    setFlash(undefined)
    setMode({ kind: 'session', scope, from, backTo })
  }
  const endSession = (): void => {
    if (mode.kind === 'session' && mode.from !== 'review') setView(mode.from)
    setMode({ kind: 'today' })
    onReviewEnd?.()
  }

  // The tile's Review N: straight into today's review.
  const [lastReview, setLastReview] = useState(review)
  if (review !== lastReview) {
    setLastReview(review)
    if (review) startSession({ kind: 'today' }, 'review', 'Review')
  }
  // A card asked for from elsewhere: its word, in Words.
  const showCard = useCallback((id: string) => {
    window.duet.cards.get(id).then(
      (card) => {
        if (!card) return
        setView('words')
        setStep(undefined)
        setMode({ kind: 'today' })
        setSelected(card.wordKey ?? wordKey(card.language, card.expression))
      },
      () => undefined
    )
  }, [])
  const [lastRequest, setLastRequest] = useState<{ id: string }>()
  if (requestedCard !== lastRequest) {
    setLastRequest(requestedCard)
    if (requestedCard) showCard(requestedCard.id)
  }
  useEffect(() => window.duet.cards.onShow(showCard), [showCard])

  const switchTo = (next: View): void => {
    setView(next)
    if (next !== 'review' && mode.kind === 'make') setMode({ kind: 'today' })
    setNotice(undefined)
  }

  const touring = tour !== undefined && !!sample
  const shownToday = touring ? sampleToday() : today
  const shownWords = touring ? sampleWords() : words.data
  const shownPiles = touring ? sampleCollections() : piles
  const shownVideos = touring ? sampleVideos() : videos
  const notOnTour = (): void => setNotice({ text: 'That waits until the tour is over.' })
  const inSession = view === 'review' && mode.kind === 'session'
  const error = settingsError ?? words.error
  return (
    <main className="home-page fc-page">
      <div className="fc">
        <div className="fc-bar">
          <div className="fc-seg" role="group" aria-label="View">
            {VIEWS.map(([id, name]) => (
              <button
                type="button"
                key={id}
                aria-pressed={view === id}
                onClick={() => switchTo(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <span className="grow" />
          {view === 'review' && mode.kind === 'make' && (
            <button type="button" className="quiet" onClick={() => setMode({ kind: 'today' })}>
              Cancel
            </button>
          )}
          {inSession && (
            <button type="button" className="quiet" onClick={endSession}>
              Done for now
            </button>
          )}
          {view === 'words' && !touring && <BackupMenu onNotice={(found) => setNotice(found)} />}
          <button
            type="button"
            className="fc-help"
            aria-label="How cards work"
            title="How cards work"
            onClick={() => (touring ? undefined : openTour())}
          >
            ?
          </button>
        </div>
        {(notice || error) && (
          <p
            className={`fc-notice${notice?.error || (!notice && error) ? ' error' : ''}`}
            role={notice?.error || error ? 'alert' : 'status'}
          >
            <span>{notice?.text ?? error}</span>
            {notice?.undo && (
              <button
                type="button"
                onClick={() => {
                  notice.undo?.()
                  setNotice(undefined)
                }}
              >
                Undo
              </button>
            )}
            {notice && (
              <button type="button" onClick={() => setNotice(undefined)}>
                OK
              </button>
            )}
          </p>
        )}
        <section className="fc-view" key={`${view}|${mode.kind}|${touring ? 'tour' : 'own'}`}>
          {view === 'review' && mode.kind === 'session' && prefs && (
            <Session
              scope={mode.scope}
              backTo={mode.backTo}
              kindsSeen={touring ? [] : prefs.kindsSeen}
              onKindSeen={touring ? () => undefined : onKindSeen}
              onBack={endSession}
              onAskDuet={touring ? notOnTour : onPractise}
              api={sample}
            />
          )}
          {view === 'review' && mode.kind === 'make' && language && (
            <MakeCard
              language={language}
              initial={mode.word}
              onKept={(word, another) => {
                setFlash(word)
                if (!another) setMode({ kind: 'today' })
              }}
            />
          )}
          {view === 'review' && mode.kind === 'today' && (
            <Today
              today={shownToday}
              flash={flash}
              onStart={() => startSession({ kind: 'today' }, 'review', 'Review')}
              onStep={(picked) => {
                setStep(picked)
                setSelected(undefined)
                switchTo('words')
              }}
              onMake={() => {
                if (touring) return notOnTour()
                setFlash(undefined)
                setMode({ kind: 'make' })
              }}
            />
          )}
          {view === 'words' && (
            <Words
              data={shownWords}
              step={step}
              selected={selected}
              onStep={setStep}
              onSelect={setSelected}
              onPractise={(key, word) => startSession({ kind: 'practise', key }, 'words', word)}
              onAsk={touring ? notOnTour : onPractise}
              onMake={(word) => {
                if (touring) return notOnTour()
                setView('review')
                setMode({ kind: 'make', word })
              }}
              onNotice={setNotice}
              api={sample}
              sample={touring}
            />
          )}
          {view === 'collections' && (
            <Collections
              piles={shownPiles}
              videos={shownVideos}
              onReviewPile={(id) =>
                startSession({ kind: 'collection', id }, 'collections', 'Collections')
              }
              onReviewVideo={(id) =>
                startSession({ kind: 'video', video: id }, 'collections', 'Collections')
              }
              onAnki={() => setNotice({ text: 'Bringing in Anki decks is coming soon.' })}
            />
          )}
        </section>
        {touring && (
          <Guide
            at={tour}
            onAt={moveTour}
            onClose={() => endTour(false)}
            onFinish={() => endTour(true)}
          />
        )}
      </div>
    </main>
  )
}
