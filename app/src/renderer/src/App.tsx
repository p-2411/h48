import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppSettings,
  DuetCard,
  Explanation,
  Moment,
  PronunciationResult,
  ReviewPreview,
  ReviewQueue,
  ReviewRating,
  SaveCardInput,
  TutorTurn
} from '../../shared/types'

type View = 'learn' | 'cards' | 'review' | 'settings'

const moments: Moment[] = [
  {
    id: 'fixture-003',
    revision: 1,
    japanese: 'ていうか、別にそういうつもりじゃなかったんだけど。',
    reading: 'ていうか、べつにそういうつもりじゃなかったんだけど。',
    precedingContext: ['急に黙ったから、怒ってるのかと思った。', 'え、違うよ。'],
    sourceType: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=duet-demo',
    videoTitle: 'Midnight Platform · Episode 2',
    timestamp: 107,
    cueId: 'cue-003',
    captionProvenance: 'fixture',
    timingQuality: 'exact'
  },
  {
    id: 'fixture-002',
    revision: 1,
    japanese: 'え、違うよ。',
    reading: 'え、ちがうよ。',
    precedingContext: ['急に黙ったから、怒ってるのかと思った。'],
    sourceType: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=duet-demo',
    videoTitle: 'Midnight Platform · Episode 2',
    timestamp: 103,
    cueId: 'cue-002',
    captionProvenance: 'fixture',
    timingQuality: 'exact'
  },
  {
    id: 'fixture-001',
    revision: 1,
    japanese: '急に黙ったから、怒ってるのかと思った。',
    reading: 'きゅうにだまったから、おこってるのかとおもった。',
    precedingContext: [],
    sourceType: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=duet-demo',
    videoTitle: 'Midnight Platform · Episode 2',
    timestamp: 98,
    cueId: 'cue-001',
    captionProvenance: 'fixture',
    timingQuality: 'exact'
  }
]

const defaultSettings: AppSettings = {
  readingAids: 'kana',
  textScale: 'default',
  newCardAllowance: 10,
  desiredRetention: 0.9,
  explanationLanguage: 'balanced'
}

function Mark(): React.JSX.Element {
  return (
    <svg className="mark" viewBox="0 0 30 24" aria-hidden="true">
      <rect x="1" y="2" width="17" height="12" rx="4" fill="currentColor" />
      <rect
        x="10"
        y="9"
        width="19"
        height="13"
        rx="4"
        fill="#000"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

function Icon({
  name
}: {
  name: 'spark' | 'cards' | 'review' | 'settings' | 'play' | 'mic' | 'save'
}): React.JSX.Element {
  const paths = {
    spark: (
      <path d="m12 2 1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Zm6 12 .9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z" />
    ),
    cards: (
      <>
        <rect x="4" y="5" width="13" height="15" rx="2" />
        <path d="M8 5V3h10a2 2 0 0 1 2 2v12h-3" />
      </>
    ),
    review: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" />
        <path d="M4 4v4.5h4.5M12 8v4l3 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </>
    ),
    save: (
      <>
        <path d="M6 3h10l3 3v15H5V3h1Z" />
        <path d="M8 3v6h8V3M8 21v-7h8v7" />
      </>
    )
  }
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function formatTimestamp(seconds = 0): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('DUPLICATE_CARD'))
    return 'This exact learning target is already in My cards.'
  if (message.includes('STALE'))
    return 'This card changed elsewhere. The latest version has been loaded.'
  if (message.includes('TARGET_CHANGE'))
    return 'Create a new card when changing an already-reviewed learning target.'
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

function App(): React.JSX.Element {
  const [view, setView] = useState<View>('learn')
  const [cards, setCards] = useState<DuetCard[]>([])
  const [queue, setQueue] = useState<ReviewQueue>({
    cards: [],
    counts: { dueNow: 0, laterToday: 0, newCards: 0 }
  })
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    const [nextCards, nextQueue, nextSettings] = await Promise.all([
      window.duet.listCards(),
      window.duet.getReviewQueue(),
      window.duet.getSettings()
    ])
    setCards(nextCards)
    setQueue(nextQueue)
    setSettings(nextSettings)
  }, [])

  useEffect(() => {
    refresh()
      .catch((error) => setToast(friendlyError(error)))
      .finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const openView = (next: View): void => {
    setView(next)
    if (next === 'review') void refresh()
  }

  return (
    <div className={`app-shell text-${settings.textScale}`}>
      <div className="aura" aria-hidden="true" />
      <aside className="sidebar">
        <button className="brand" onClick={() => openView('learn')} aria-label="Duet home">
          <Mark />
          <span>Duet</span>
          <small>Japanese</small>
        </button>
        <nav aria-label="Product navigation">
          <button className={view === 'learn' ? 'active' : ''} onClick={() => openView('learn')}>
            <Icon name="spark" />
            <span>Learn</span>
          </button>
          <button className={view === 'cards' ? 'active' : ''} onClick={() => openView('cards')}>
            <Icon name="cards" />
            <span>My cards</span>
            <b>{cards.length}</b>
          </button>
          <button className={view === 'review' ? 'active' : ''} onClick={() => openView('review')}>
            <Icon name="review" />
            <span>Review</span>
            {queue.cards.length > 0 && <b className="due">{queue.cards.length}</b>}
          </button>
        </nav>
        <button
          className={`settings-link ${view === 'settings' ? 'active' : ''}`}
          onClick={() => openView('settings')}
        >
          <Icon name="settings" />
          <span>Settings</span>
        </button>
        <div className="local-badge">
          <i />
          Stored locally
        </div>
      </aside>

      <main className="workspace">
        {loading ? (
          <div className="loading-state">
            <Mark />
            <span>Opening your local library…</span>
          </div>
        ) : null}
        {!loading && view === 'learn' && (
          <LearnView settings={settings} onSaved={refresh} notify={setToast} />
        )}
        {!loading && view === 'cards' && (
          <CardsView cards={cards} onChanged={refresh} notify={setToast} />
        )}
        {!loading && view === 'review' && (
          <ReviewView queue={queue} onChanged={refresh} notify={setToast} />
        )}
        {!loading && view === 'settings' && (
          <SettingsView settings={settings} onChanged={refresh} notify={setToast} />
        )}
      </main>
      <div className={`toast ${toast ? 'show' : ''}`} role="status">
        {toast}
      </div>
    </div>
  )
}

function LearnView({
  settings,
  onSaved,
  notify
}: {
  settings: AppSettings
  onSaved: () => Promise<void>
  notify: (message: string) => void
}): React.JSX.Element {
  const [moment, setMoment] = useState(moments[0])
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [playing, setPlaying] = useState(false)

  const explain = async (): Promise<void> => {
    setIsExplaining(true)
    setExplanation(null)
    try {
      const value = await window.duet.explain(moment)
      if (value.momentId === moment.id && value.momentRevision === moment.revision)
        setExplanation(value)
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setIsExplaining(false)
    }
  }

  const selectMoment = (next: Moment): void => {
    setMoment(next)
    setExplanation(null)
    setVoiceOpen(false)
  }

  return (
    <div className="learn-layout">
      <section className="watch-column">
        <header className="page-head compact">
          <div>
            <p className="eyebrow">Supported demo source</p>
            <h1>Understand the moment.</h1>
          </div>
          <span className="source-status">
            <i />
            Japanese captions ready
          </span>
        </header>
        <div className={`video-stage ${playing ? 'playing' : ''}`}>
          <div className="scene-art">
            <span className="moon" />
            <span className="platform far" />
            <span className="platform near" />
          </div>
          <div className="video-caption" lang="ja">
            {moment.japanese}
          </div>
          <button
            className="center-play"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? 'Pause video' : 'Play video'}
          >
            <Icon name="play" />
          </button>
          <div className="video-controls">
            <button onClick={() => setPlaying((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
            <span className="track">
              <i style={{ width: '34%' }} />
            </span>
            <time>{formatTimestamp(moment.timestamp)} / 5:12</time>
            <span>CC 日本語</span>
          </div>
        </div>
        <div className="video-meta">
          <div>
            <h2>Midnight Platform</h2>
            <p>Episode 2 · Human-captioned demo</p>
          </div>
          <button className="ghost-button" onClick={() => setPlaying(true)}>
            Return to video
          </button>
        </div>
        <div className="recent-lines">
          <div className="section-title">
            <span>Recent lines</span>
            <small>Choose the line you meant</small>
          </div>
          {moments.map((item) => (
            <button
              key={item.id}
              className={item.id === moment.id ? 'selected' : ''}
              onClick={() => selectMoment(item)}
            >
              <time>{formatTimestamp(item.timestamp)}</time>
              <span lang="ja">{item.japanese}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="assistant-panel">
        <div className="panel-head">
          <div className="panel-brand">
            <Mark />
            <div>
              <b>Duet</b>
              <small>Meaning, not just words</small>
            </div>
          </div>
          <span className="fixture-label">Demo source</span>
        </div>
        <div className="selected-line">
          <p className="eyebrow">
            <span className="live-dot" />
            Selected · {formatTimestamp(moment.timestamp)}
          </p>
          <h2 lang="ja">{moment.japanese}</h2>
          {settings.readingAids !== 'off' && (
            <p className="reading">
              {settings.readingAids === 'kana'
                ? moment.reading
                : 'te iu ka, betsu ni sou iu tsumori ja nakatta n da kedo.'}
            </p>
          )}
        </div>

        {!explanation && !isExplaining && (
          <div className="explain-empty">
            <div className="orb">
              <Icon name="spark" />
            </div>
            <h3>What does this mean here?</h3>
            <p>
              Get a short explanation grounded in this scene, including the one distinction worth
              noticing.
            </p>
            <button className="primary-button" onClick={explain}>
              <Icon name="spark" />
              Explain that
            </button>
          </div>
        )}
        {isExplaining && (
          <div className="explain-loading">
            <span />
            <span />
            <span />
            <p>Looking at this line and its context…</p>
          </div>
        )}
        {explanation && (
          <div className="explanation">
            <div className="explanation-section hero-answer">
              <p className="field-label">Meaning here</p>
              <p>{explanation.meaning}</p>
            </div>
            {explanation.notice && (
              <div className="explanation-section">
                <p className="field-label">What to notice</p>
                <p>{explanation.notice}</p>
              </div>
            )}
            {explanation.why && (
              <div className="explanation-section">
                <p className="field-label">Why here</p>
                <p>{explanation.why}</p>
              </div>
            )}
            {explanation.alternative && (
              <div className="explanation-section alternative">
                <p className="field-label">A useful alternative</p>
                <p>{explanation.alternative}</p>
              </div>
            )}
            {explanation.limitation && <p className="limitation">{explanation.limitation}</p>}
            <span className="provenance">
              {explanation.provenance === 'reviewed-demo'
                ? 'Reviewed demo explanation'
                : 'Generated interpretation'}
            </span>
          </div>
        )}

        <button
          className={`context-toggle ${showContext ? 'open' : ''}`}
          onClick={() => setShowContext((value) => !value)}
          aria-expanded={showContext}
        >
          <span>Conversation context</span>
          <span>⌄</span>
        </button>
        {showContext && (
          <div className="context-lines">
            {moment.precedingContext.map((line, index) => (
              <p key={line}>
                <time>-{moment.precedingContext.length - index}</time>
                <span lang="ja">{line}</span>
              </p>
            ))}
            <p className="current">
              <time>Now</time>
              <span lang="ja">{moment.japanese}</span>
            </p>
          </div>
        )}

        <div className="panel-actions">
          <button onClick={() => setPlaying(true)}>
            <Icon name="play" />
            <span>Replay</span>
          </button>
          <button disabled={!explanation} onClick={() => setVoiceOpen(true)}>
            <Icon name="mic" />
            <span>Talk about this</span>
          </button>
          <button disabled={!explanation} onClick={() => setSaveOpen(true)}>
            <Icon name="save" />
            <span>Save card</span>
          </button>
        </div>
      </section>

      {saveOpen && explanation && (
        <SaveCardModal
          moment={moment}
          explanation={explanation}
          close={() => setSaveOpen(false)}
          saved={async () => {
            setSaveOpen(false)
            await onSaved()
            notify('Saved to My cards')
          }}
          notify={notify}
        />
      )}
      {voiceOpen && explanation && (
        <VoicePanel moment={moment} close={() => setVoiceOpen(false)} notify={notify} />
      )}
    </div>
  )
}

function SaveCardModal({
  moment,
  explanation,
  close,
  saved,
  notify
}: {
  moment: Moment
  explanation: Explanation
  close: () => void
  saved: () => Promise<void>
  notify: (message: string) => void
}): React.JSX.Element {
  const [input, setInput] = useState<SaveCardInput>({
    expression: moment.japanese,
    reading: moment.reading,
    meaning: explanation.meaning,
    target: explanation.notice ?? 'Meaning in this context',
    context: moment.precedingContext.concat(moment.japanese).join(' '),
    alternative: explanation.alternative,
    cardType: 'understand',
    sourceType: moment.sourceType,
    videoUrl: moment.videoUrl,
    videoTitle: moment.videoTitle,
    sourceTimestamp: moment.timestamp,
    provenance: `${explanation.provenance}:${explanation.version}`
  })
  const [saving, setSaving] = useState(false)
  const update = (key: keyof SaveCardInput, value: string): void =>
    setInput((current) => ({ ...current, [key]: value }))
  const submit = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.duet.createCard(input)
      await saved()
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="save-title">
        <header>
          <div>
            <p className="eyebrow">New contextual card</p>
            <h2 id="save-title">Save what matters.</h2>
          </div>
          <button className="close-button" onClick={close} aria-label="Close">
            ×
          </button>
        </header>
        <div className="segmented">
          <button
            className={input.cardType === 'understand' ? 'active' : ''}
            onClick={() => setInput((value) => ({ ...value, cardType: 'understand' }))}
          >
            Understand
          </button>
          <button
            className={input.cardType === 'use' ? 'active' : ''}
            onClick={() => setInput((value) => ({ ...value, cardType: 'use' }))}
          >
            Use it
          </button>
        </div>
        <label>
          <span>Expression</span>
          <textarea
            value={input.expression}
            onChange={(event) => update('expression', event.target.value)}
            lang="ja"
          />
        </label>
        <div className="field-grid">
          <label>
            <span>Meaning</span>
            <textarea
              value={input.meaning}
              onChange={(event) => update('meaning', event.target.value)}
            />
          </label>
          <label>
            <span>Learning target</span>
            <textarea
              value={input.target}
              onChange={(event) => update('target', event.target.value)}
            />
          </label>
        </div>
        <label>
          <span>
            Personal note <small>Optional</small>
          </span>
          <input
            value={input.note ?? ''}
            onChange={(event) => update('note', event.target.value)}
            placeholder="Why do you want to remember this?"
          />
        </label>
        <footer>
          <p>Starts as New. Saving is not a review.</p>
          <div>
            <button className="ghost-button" onClick={close}>
              Cancel
            </button>
            <button className="primary-button" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Save card'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}

function VoicePanel({
  moment,
  close,
  notify
}: {
  moment: Moment
  close: () => void
  notify: (message: string) => void
}): React.JSX.Element {
  const [turns, setTurns] = useState<TutorTurn[]>([
    {
      role: 'assistant',
      text: 'What would you like to understand or practise about this expression?'
    }
  ])
  const [draft, setDraft] = useState('Could I say this to someone I just met?')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<PronunciationResult | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const send = async (): Promise<void> => {
    if (!draft.trim() || busy) return
    const next = [...turns, { role: 'user' as const, text: draft.trim() }]
    setTurns(next)
    setDraft('')
    setBusy(true)
    try {
      const reply = await window.duet.tutor(moment, next)
      setTurns([...next, { role: 'assistant', text: reply.text }])
    } catch (error) {
      notify(friendlyError(error))
    } finally {
      setBusy(false)
    }
  }
  const toggleRecording = async (): Promise<void> => {
    if (recording) {
      recorder.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      recorder.current = mediaRecorder
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => chunks.current.push(event.data)
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const buffer = await new Blob(chunks.current, {
          type: mediaRecorder.mimeType
        }).arrayBuffer()
        const assessment = await window.duet.assessPronunciation(moment, buffer)
        setResult(assessment)
      }
      mediaRecorder.start()
      setRecording(true)
    } catch {
      notify('Microphone access was not available. Text conversation still works.')
    }
  }
  return (
    <div className="drawer-backdrop">
      <aside className="voice-drawer" role="dialog" aria-modal="true">
        <header>
          <div>
            <p className="eyebrow">
              <span className="live-dot" />
              Voice tutor · attached expression
            </p>
            <h2 lang="ja">{moment.japanese}</h2>
          </div>
          <button className="close-button" onClick={close}>
            ×
          </button>
        </header>
        <div className="voice-tabs">
          <button className="active">Talk about this</button>
          <button onClick={toggleRecording}>Practise this line</button>
        </div>
        <div className="conversation">
          {turns.map((turn, index) => (
            <div key={`${turn.role}-${index}`} className={`turn ${turn.role}`}>
              {turn.role === 'assistant' && <Mark />}
              <p>{turn.text}</p>
            </div>
          ))}
          {busy && (
            <div className="turn assistant thinking">
              <Mark />
              <p>Thinking…</p>
            </div>
          )}
          {result && (
            <div className={`assessment ${result.status}`}>
              <p className="field-label">Pronunciation check · {result.status}</p>
              <p>{result.feedback}</p>
              <small>{result.nextAction}</small>
            </div>
          )}
        </div>
        <div className="record-bar">
          <button
            className={`record-button ${recording ? 'recording' : ''}`}
            onClick={toggleRecording}
          >
            <Icon name="mic" />
            {recording ? 'Stop recording' : 'Practise this line'}
          </button>
          <span>{recording ? 'Listening…' : 'Push to record · explicit turn-taking'}</span>
        </div>
        <div className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder="Ask about meaning, usage, or try a reply…"
          />
          <button className="primary-button" onClick={send} disabled={busy}>
            Send
          </button>
        </div>
      </aside>
    </div>
  )
}

function CardsView({
  cards,
  onChanged,
  notify
}: {
  cards: DuetCard[]
  onChanged: () => Promise<void>
  notify: (message: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'new' | 'due' | 'paused'>('all')
  const [selected, setSelected] = useState<DuetCard | null>(cards[0] ?? null)
  useEffect(() => {
    if (selected) setSelected(cards.find((card) => card.id === selected.id) ?? cards[0] ?? null)
    else setSelected(cards[0] ?? null)
  }, [cards, selected])
  const visible = useMemo(
    () =>
      cards.filter((card) => {
        const matches = `${card.expression} ${card.meaning} ${card.note ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())
        if (!matches) return false
        if (filter === 'new') return card.scheduler.state === 0
        if (filter === 'due') return new Date(card.scheduler.due) <= new Date() && !card.paused
        if (filter === 'paused') return card.paused
        return true
      }),
    [cards, query, filter]
  )
  const updatePause = async (card: DuetCard): Promise<void> => {
    try {
      await window.duet.updateCard({
        id: card.id,
        expectedRevision: card.revision,
        paused: !card.paused
      })
      await onChanged()
    } catch (error) {
      notify(friendlyError(error))
    }
  }
  const remove = async (card: DuetCard): Promise<void> => {
    if (!window.confirm(`Delete “${card.expression}” and its review history?`)) return
    await window.duet.deleteCard(card.id)
    setSelected(null)
    await onChanged()
    notify('Card deleted')
  }
  return (
    <div className="cards-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Your contextual library</p>
          <h1>My cards.</h1>
        </div>
        <div className="page-stat">
          <b>{cards.length}</b>
          <span>saved expressions</span>
        </div>
      </header>
      <div className="library-toolbar">
        <label className="search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Japanese, meaning, or notes"
          />
        </label>
        <div className="filter-pills">
          {(['all', 'new', 'due', 'paused'] as const).map((item) => (
            <button
              key={item}
              className={filter === item ? 'active' : ''}
              onClick={() => setFilter(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="library-grid">
        <div className="card-list">
          {visible.length === 0 && (
            <div className="empty-list">
              <Icon name="cards" />
              <h3>No cards here yet.</h3>
              <p>Save a useful expression from the Learn view.</p>
            </div>
          )}
          {visible.map((card) => (
            <button
              key={card.id}
              className={selected?.id === card.id ? 'selected' : ''}
              onClick={() => setSelected(card)}
            >
              <div>
                <span className="card-type">
                  {card.cardType === 'understand' ? 'Understand' : 'Use it'}
                </span>
                {card.paused && <span className="paused-tag">Paused</span>}
              </div>
              <h3 lang="ja">{card.expression}</h3>
              <p>{card.meaning}</p>
              <footer>
                <span>{card.videoTitle ?? 'Tutor-created example'}</span>
                <time>
                  {card.scheduler.state === 0
                    ? 'New'
                    : new Date(card.scheduler.due).toLocaleDateString()}
                </time>
              </footer>
            </button>
          ))}
        </div>
        {selected ? (
          <article className="card-detail">
            <header>
              <div>
                <p className="eyebrow">
                  {selected.cardType === 'understand' ? 'Understand card' : 'Use it card'}
                </p>
                <h2 lang="ja">{selected.expression}</h2>
                {selected.reading && <p className="reading">{selected.reading}</p>}
              </div>
              <div className="detail-menu">
                <button onClick={() => void updatePause(selected)}>
                  {selected.paused ? 'Resume' : 'Pause'}
                </button>
                <button className="danger-text" onClick={() => void remove(selected)}>
                  Delete
                </button>
              </div>
            </header>
            <section>
              <p className="field-label">Meaning</p>
              <p className="detail-meaning">{selected.meaning}</p>
            </section>
            <section>
              <p className="field-label">Learning target</p>
              <p>{selected.target}</p>
            </section>
            <section>
              <p className="field-label">Original context</p>
              <p lang="ja">{selected.context}</p>
            </section>
            {selected.alternative && (
              <section>
                <p className="field-label">Alternative</p>
                <p>{selected.alternative}</p>
              </section>
            )}
            <div className="detail-source">
              <span>Source</span>
              <p>
                {selected.videoTitle ?? 'Tutor-created example'}
                {selected.sourceTimestamp !== undefined
                  ? ` · ${formatTimestamp(selected.sourceTimestamp)}`
                  : ''}
              </p>
              <small>{selected.provenance}</small>
            </div>
            <footer className="history-row">
              <div>
                <span>Created</span>
                <b>{new Date(selected.createdAt).toLocaleDateString()}</b>
              </div>
              <div>
                <span>Next review</span>
                <b>
                  {selected.paused ? 'Paused' : new Date(selected.scheduler.due).toLocaleString()}
                </b>
              </div>
              <div>
                <span>Reviews</span>
                <b>{selected.scheduler.reps}</b>
              </div>
            </footer>
          </article>
        ) : (
          <div className="card-detail blank">
            <p>Select a card to inspect its context and review history.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewView({
  queue,
  onChanged,
  notify
}: {
  queue: ReviewQueue
  onChanged: () => Promise<void>
  notify: (message: string) => void
}): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [previews, setPreviews] = useState<ReviewPreview[]>([])
  const [lastReviewed, setLastReviewed] = useState<string | null>(null)
  const card = queue.cards[index]
  useEffect(() => {
    setIndex(0)
    setRevealed(false)
  }, [queue.cards.length])
  useEffect(() => {
    if (card && revealed)
      window.duet
        .previewReview(card.id)
        .then(setPreviews)
        .catch((error) => notify(friendlyError(error)))
    else setPreviews([])
  }, [card, revealed, notify])
  const rate = async (rating: ReviewRating): Promise<void> => {
    if (!card) return
    try {
      await window.duet.reviewCard({
        cardId: card.id,
        expectedRevision: card.revision,
        eventId: crypto.randomUUID(),
        rating
      })
      setLastReviewed(card.id)
      setRevealed(false)
      if (index + 1 < queue.cards.length) setIndex((value) => value + 1)
      else await onChanged()
    } catch (error) {
      notify(friendlyError(error))
      await onChanged()
    }
  }
  const undo = async (): Promise<void> => {
    if (!lastReviewed) return
    try {
      await window.duet.undoLatestReview(lastReviewed)
      setLastReviewed(null)
      await onChanged()
      notify('Latest review undone')
    } catch (error) {
      notify(friendlyError(error))
    }
  }
  if (!card)
    return (
      <div className="review-page">
        <header className="page-head">
          <div>
            <p className="eyebrow">FSRS review</p>
            <h1>Nothing due now.</h1>
          </div>
        </header>
        <div className="empty-review">
          <div className="orb">
            <Icon name="review" />
          </div>
          <h2>You’re caught up.</h2>
          <p>
            Future cards stay future. Practising outside a scheduled review will not change their
            schedule.
          </p>
        </div>
      </div>
    )
  return (
    <div className="review-page">
      <header className="review-head">
        <div>
          <p className="eyebrow">FSRS review</p>
          <div className="review-counts">
            <span>
              <b>{queue.counts.dueNow}</b> due
            </span>
            <span>
              <b>{queue.counts.laterToday}</b> later today
            </span>
            <span>
              <b>{queue.counts.newCards}</b> new
            </span>
          </div>
        </div>
        <div className="review-progress">
          <span
            style={{ width: `${((index + (revealed ? 0.5 : 0)) / queue.cards.length) * 100}%` }}
          />
        </div>
        <button className="ghost-button" onClick={() => void undo()} disabled={!lastReviewed}>
          Undo latest
        </button>
      </header>
      <section className={`review-card ${revealed ? 'revealed' : ''}`}>
        <p className="card-type">
          {card.cardType === 'understand'
            ? 'What does this mean here?'
            : 'What would you say here?'}
        </p>
        <h1 lang="ja">{card.cardType === 'understand' ? card.expression : card.context}</h1>
        {!revealed && (
          <p className="recall-prompt">
            Try to recall the specific target before revealing the answer.
          </p>
        )}
        {revealed && (
          <div className="review-answer">
            <div>
              <p className="field-label">Answer</p>
              <h2>{card.cardType === 'understand' ? card.meaning : card.expression}</h2>
            </div>
            <div>
              <p className="field-label">What matters</p>
              <p>{card.target}</p>
            </div>
            <div>
              <p className="field-label">Context</p>
              <p>{card.context}</p>
            </div>
          </div>
        )}
      </section>
      {!revealed ? (
        <div className="review-actions">
          <button className="primary-button reveal" onClick={() => setRevealed(true)}>
            Reveal answer
          </button>
          <button
            className="ghost-button"
            onClick={() => setIndex((value) => Math.min(value + 1, queue.cards.length - 1))}
          >
            Skip
          </button>
        </div>
      ) : (
        <div className="rating-grid">
          {(['again', 'hard', 'good', 'easy'] as ReviewRating[]).map((rating) => (
            <button key={rating} className={rating} onClick={() => void rate(rating)}>
              <b>{rating[0].toUpperCase() + rating.slice(1)}</b>
              <span>{previews.find((item) => item.rating === rating)?.intervalLabel ?? '…'}</span>
              <small>
                {rating === 'again'
                  ? 'Did not recall'
                  : rating === 'hard'
                    ? 'Correct, difficult'
                    : rating === 'good'
                      ? 'Correct, ordinary effort'
                      : 'Correct, very easy'}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsView({
  settings,
  onChanged,
  notify
}: {
  settings: AppSettings
  onChanged: () => Promise<void>
  notify: (message: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(settings)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(settings), [settings])
  const save = async (): Promise<void> => {
    try {
      await window.duet.saveSettings(draft)
      await onChanged()
      notify('Settings saved')
    } catch (error) {
      notify(friendlyError(error))
    }
  }
  const backup = async (): Promise<void> => {
    const value = await window.duet.exportBackup()
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `duet-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    notify('Backup exported')
  }
  const restore = async (file?: File): Promise<void> => {
    if (!file) return
    try {
      await window.duet.importBackup(await file.text())
      await onChanged()
      notify('Backup restored; existing IDs were preserved')
    } catch (error) {
      notify(friendlyError(error))
    }
  }
  const clear = async (): Promise<void> => {
    if (
      !window.confirm(
        'Delete every local card, review event, and voice attempt? Export a backup first if you may need this data.'
      )
    )
      return
    await window.duet.clearAllData()
    await onChanged()
    notify('Local learning data deleted')
  }
  return (
    <div className="settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Local-first controls</p>
          <h1>Settings.</h1>
        </div>
        <button className="primary-button" onClick={() => void save()}>
          Save changes
        </button>
      </header>
      <div className="settings-grid">
        <section>
          <header>
            <h2>Reading and tutoring</h2>
            <p>Choose how Duet supports the source without replacing it.</p>
          </header>
          <label className="setting-row">
            <span>
              <b>Reading aids</b>
              <small>Shown under selected Japanese</small>
            </span>
            <select
              value={draft.readingAids}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  readingAids: event.target.value as AppSettings['readingAids']
                })
              }
            >
              <option value="kana">Kana reading</option>
              <option value="romaji">Romaji</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="setting-row">
            <span>
              <b>Explanation balance</b>
              <small>Voice practice may still use Japanese</small>
            </span>
            <select
              value={draft.explanationLanguage}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  explanationLanguage: event.target.value as AppSettings['explanationLanguage']
                })
              }
            >
              <option value="balanced">Balanced</option>
              <option value="english">More English</option>
              <option value="japanese">More Japanese</option>
            </select>
          </label>
          <label className="setting-row">
            <span>
              <b>Text size</b>
              <small>Japanese remains readable at browser zoom</small>
            </span>
            <select
              value={draft.textScale}
              onChange={(event) =>
                setDraft({ ...draft, textScale: event.target.value as AppSettings['textScale'] })
              }
            >
              <option value="default">Default</option>
              <option value="large">Large</option>
            </select>
          </label>
        </section>
        <section>
          <header>
            <h2>FSRS workload</h2>
            <p>These choices affect subsequent rated reviews, not existing history.</p>
          </header>
          <label className="range-setting">
            <span>
              <b>Desired retention</b>
              <output>{Math.round(draft.desiredRetention * 100)}%</output>
            </span>
            <input
              type="range"
              min="0.70"
              max="0.99"
              step="0.01"
              value={draft.desiredRetention}
              onChange={(event) =>
                setDraft({ ...draft, desiredRetention: Number(event.target.value) })
              }
            />
            <small>Higher targets generally mean more reviews.</small>
          </label>
          <label className="setting-row">
            <span>
              <b>New cards per study day</b>
              <small>First committed ratings, not saves</small>
            </span>
            <input
              className="number-input"
              type="number"
              min="0"
              max="100"
              value={draft.newCardAllowance}
              onChange={(event) =>
                setDraft({ ...draft, newCardAllowance: Number(event.target.value) })
              }
            />
          </label>
        </section>
        <section className="data-section">
          <header>
            <h2>Local data</h2>
            <p>Cards and review history live in a SQLite database on this device.</p>
          </header>
          <div className="data-actions">
            <button onClick={() => void backup()}>
              <b>Export structured backup</b>
              <small>Cards, FSRS state, review history and settings</small>
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <b>Restore backup</b>
              <small>Validated merge; existing IDs are not overwritten</small>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => void restore(event.target.files?.[0])}
            />
            <button className="danger" onClick={() => void clear()}>
              <b>Delete all local learning data</b>
              <small>This cannot be undone without a backup</small>
            </button>
          </div>
        </section>
        <section>
          <header>
            <h2>Service status</h2>
            <p>Remote capabilities stay honest when a provider is unavailable.</p>
          </header>
          <div className="service-list">
            <div>
              <i className="ok" />
              <span>
                <b>Local cards and FSRS</b>
                <small>Available offline</small>
              </span>
            </div>
            <div>
              <i className="demo" />
              <span>
                <b>Explanation and tutor</b>
                <small>
                  Reviewed demo fallback; set DUET_AI_ENDPOINT and DUET_AI_API_KEY for a provider
                </small>
              </span>
            </div>
            <div>
              <i className="limited" />
              <span>
                <b>Pronunciation assessment</b>
                <small>
                  Records safely; abstains until a validated acoustic provider is configured
                </small>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
