// Words: every word met, in its step's colour, beside the word picked: its dictionary entry (the
// same as its card's back), its step, when it's next reviewed, and what can be done with it.
import { useEffect, useMemo, useState } from 'react'
import type { CardDetail, CardContent } from '../../../../shared/cards'
import {
  comesBack,
  STEP_LABELS,
  STEP_STATE,
  STEPS,
  stepOf,
  type Step,
  type WordView
} from '../../../../shared/flashcards'
import type { Language } from '../../../../shared/types'
import { CardEditor } from '../../cards/CardEditor'
import { say } from '../../components/errors'
import { filterWords, joinWords } from '../words/join'
import type { WordsData } from '../words/useWordsData'
import { icons } from './bits'
import { ByDuet, Entry } from './Entry'
import type { WordApi } from './sample'

type Notice = { text: string; error?: boolean; undo?: () => void }

/** The word picked: where it stands, its entry, and its actions. */
function Detail({
  language,
  wordKey,
  version,
  onPractise,
  onAsk,
  onMake,
  onNotice,
  api,
  sample
}: {
  language: Language
  wordKey: string
  /** Changes when the words or cards were loaded again. */
  version: unknown
  onPractise: (key: string, word: string) => void
  onAsk: (word: string) => void
  onMake: (word: string) => void
  onNotice: (notice: Notice) => void
  api: WordApi
  /** The tour's sample word: nothing on it can be edited, paused, ignored or deleted. */
  sample: boolean
}): React.JSX.Element {
  const [word, setWord] = useState<WordView>()
  // When the word was loaded: what's due is worked out against it.
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<CardDetail>()
  const [picturing, setPicturing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api.word(language, wordKey).then(
      (found) => {
        if (!live) return
        setWord(found)
        setLoadedAt(Date.now())
        setError(undefined)
      },
      (cause) => live && setError(say(cause, 'Could not load that word.'))
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, wordKey, version])
  const run = async (work: () => Promise<unknown>, failure: string): Promise<void> => {
    setBusy(true)
    try {
      await work()
    } catch (cause) {
      onNotice({ text: say(cause, failure), error: true })
    } finally {
      setBusy(false)
    }
  }
  const closeMenu = (event: React.MouseEvent): void => {
    event.currentTarget.closest('details')?.removeAttribute('open')
  }

  if (error) return <p className="fc-pick">{error}</p>
  if (!word || word.key !== wordKey) return <div className="fc-detail" />
  const card = word.cards[0]
  const stepIndex = STEPS.indexOf(word.step)
  if (editing)
    return (
      <div className="fc-detail">
        <CardEditor
          card={editing}
          busy={busy}
          onCancel={() => setEditing(undefined)}
          onSave={(content: CardContent) =>
            void run(
              async () => (
                await window.duet.cards.update(editing.id, content),
                setEditing(undefined)
              ),
              'That card could not be saved.'
            )
          }
          onSaveAsNew={(content: CardContent) =>
            void run(
              async () => (
                await window.duet.cards.saveAsNew(editing.id, content),
                setEditing(undefined)
              ),
              'That card could not be saved.'
            )
          }
        />
      </div>
    )
  return (
    <div className="fc-detail" data-tour="word">
      <div className="fc-step-row" data-step={word.step}>
        <span className="fc-step-chip">
          <span className="dot" />
          {word.ignored ? 'Ignored' : STEP_LABELS[word.step]}
        </span>
        <span className="fc-ladder-mini" aria-hidden="true">
          {STEPS.map((step, index) => (
            <span key={step} className={index <= stepIndex ? 'on' : ''} />
          ))}
        </span>
        {word.nextReview !== undefined && (
          <span className="fc-next-due">
            {word.paused
              ? 'Paused'
              : word.nextReview <= loadedAt
                ? 'Up for review now'
                : `Next review ${comesBack(word.nextReview, loadedAt)}`}
          </span>
        )}
      </div>
      <Entry
        data={{ ...word, byDuet: card?.example?.byDuet }}
        onReplay={
          word.lastHeard?.replayable ? () => void api.replay(language, word.key) : undefined
        }
      />
      {word.cards.length > 0 && !word.lastHeard && (
        <p className="fc-no-video">
          <ByDuet />
          <span>
            No video yet. The first time you hear <b>{word.word}</b> while watching, Duet adds that
            moment to its card.
          </span>
        </p>
      )}
      {picturing && word.picture && (
        <div className="fc-panel">
          {word.picture.url && <img src={word.picture.url} alt="" />}
          <span className="fc-small">
            {word.picture.state === 'set'
              ? 'Change the picture for its picture card.'
              : 'A picture lets this word ask “What’s this called?” now and then.'}
          </span>
          <div className="row">
            {word.picture.fromVideo && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Capture a still from the video? Duet plays the word’s moment and takes one picture of the video window.'
                    )
                  )
                    void run(
                      () => api.picture(word.picture!.cardId, 'capture'),
                      'The still could not be captured.'
                    )
                }}
              >
                Capture from the video
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.picture(word.picture!.cardId, 'upload'),
                  'That picture could not be used.'
                )
              }
            >
              Upload a picture
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.picture(word.picture!.cardId, 'generate'),
                  'A picture could not be made.'
                )
              }
            >
              {busy ? 'Working…' : 'Make one'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => (
                    await api.picture(word.picture!.cardId, 'none'),
                    setPicturing(false)
                  ),
                  'That could not be saved.'
                )
              }
            >
              No picture
            </button>
          </div>
        </div>
      )}
      <div className="fc-actions">
        {word.cards.length > 0 ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={() => onPractise(word.key, word.word)}
            >
              Practise now
            </button>
            <button
              type="button"
              className="soft"
              aria-pressed={word.sooner}
              title="Brings it back sooner, without counting it as forgotten"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => setWord(await api.setSooner(language, word.key, !word.sooner)),
                  'That could not be changed.'
                )
              }
            >
              {word.sooner ? 'Recalling sooner' : 'Recall sooner'}
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => onMake(word.word)}>
            Make a card
          </button>
        )}
        {!sample && (
          <details className="fc-more">
            <summary aria-label="More">⋯</summary>
            <div className="fc-menu" role="menu">
              {card && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    closeMenu(event)
                    void run(
                      async () => setEditing(await window.duet.cards.get(card.id)),
                      'That card could not be opened.'
                    )
                  }}
                >
                  Edit card
                </button>
              )}
              {word.picture && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    closeMenu(event)
                    setPicturing(true)
                  }}
                >
                  {word.picture.state === 'set' ? 'Change its picture' : 'Add a picture'}
                </button>
              )}
              {card && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    closeMenu(event)
                    void run(
                      async () => setWord(await api.setPaused(language, word.key, !word.paused)),
                      'That could not be changed.'
                    )
                  }}
                >
                  {word.paused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  closeMenu(event)
                  void run(
                    () => window.duet.knowledge.setIgnored(language, word.key, !word.ignored),
                    'That word could not be changed.'
                  )
                }}
              >
                {word.ignored ? 'Bring this word back' : 'Ignore this word'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  closeMenu(event)
                  onAsk(word.word)
                }}
              >
                Ask Duet about it
              </button>
              {card && (
                <>
                  <hr />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      closeMenu(event)
                      void run(async () => {
                        await window.duet.cards.remove(card.id)
                        onNotice({
                          text: `Deleted the card for “${word.word}”.`,
                          undo: () => void window.duet.cards.restore(card.id)
                        })
                      }, 'That card could not be deleted.')
                    }}
                  >
                    Delete card
                  </button>
                </>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

export function Words({
  data,
  step,
  selected,
  onStep,
  onSelect,
  onPractise,
  onAsk,
  onMake,
  onNotice,
  api = window.duet.flashcards,
  sample = false
}: {
  data?: WordsData
  step?: Step
  selected?: string
  onStep: (step?: Step) => void
  onSelect: (key: string) => void
  onPractise: (key: string, word: string) => void
  onAsk: (word: string) => void
  onMake: (word: string) => void
  onNotice: (notice: Notice) => void
  /** Where a word's page comes from: the main process, or the tour's sample (sample.ts). */
  api?: WordApi
  sample?: boolean
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const rows = useMemo(
    () => (data ? joinWords(data.summary.words, data.cards, data.language, data.at) : []),
    [data]
  )
  const shown = useMemo(
    () => filterWords(rows, { show: 'all', rung: step && STEP_STATE[step], search }),
    [rows, step, search]
  )
  const picked = (selected && rows.find((row) => row.key === selected)) || shown[0]
  if (!data) return <div className="fc-words" />
  const total = Object.values(data.summary.counts).reduce((sum, count) => sum + count, 0)
  return (
    <div className="fc-words">
      <div className="fc-list">
        <div className="fc-list-tools">
          <label className="fc-search">
            {icons.search}
            <span className="sr-only">Search your words</span>
            <input
              type="search"
              placeholder="Search your words"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="fc-filters" role="group" aria-label="Show">
            <button type="button" aria-pressed={!step} onClick={() => onStep(undefined)}>
              All
            </button>
            {STEPS.map((item) => (
              <button
                type="button"
                key={item}
                data-step={item}
                aria-pressed={step === item}
                onClick={() => onStep(item)}
              >
                <span className="dot" />
                {STEP_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="fc-rows">
          {shown.length ? (
            shown.map((row) => (
              <button
                type="button"
                key={row.key}
                data-step={stepOf(row.state)}
                aria-pressed={row.key === picked?.key}
                onClick={() => onSelect(row.key)}
              >
                <span className="txt">
                  <span className="w">{row.text}</span>
                  <span className="mean">
                    {row.cards[0]?.meaning ?? (row.cards.length ? '' : 'No card yet')}
                  </span>
                </span>
                {row.due && (
                  <span className="fc-due-dot" title="Due today">
                    <span className="sr-only">Due today</span>
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="fc-list-empty">
              {rows.length
                ? 'No words match. Try another spelling, or clear the filter.'
                : 'Words you meet while watching land here.'}
            </p>
          )}
          {total > data.summary.words.length && (
            <p className="fc-list-more">
              Showing the {data.summary.words.length} words you met most recently.
            </p>
          )}
        </div>
      </div>
      {picked ? (
        <Detail
          key={picked.key}
          language={data.language}
          wordKey={picked.key}
          version={data}
          onPractise={onPractise}
          onAsk={onAsk}
          onMake={onMake}
          onNotice={onNotice}
          api={api}
          sample={sample}
        />
      ) : (
        <p className="fc-pick">Pick a word to see where it stands.</p>
      )}
    </div>
  )
}
