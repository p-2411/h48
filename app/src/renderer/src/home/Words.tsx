// Words: every word met in the language being learnt, on its rung of the knowledge ladder (new to
// you, seen before, known, you can say it, you can use it, ignored), with how many on each. A word
// can be left out of colours and practice, or brought back. Kept in step as words climb.
import { useCallback, useEffect, useState } from 'react'
import { LADDER, STATE_LABELS, type WordsSummary, type WordState } from '../../../shared/knowledge'
import { languageName } from '../../../shared/languages'
import type { Language } from '../../../shared/types'
import { say } from '../components/errors'
import { LoadState } from '../components/LoadState'
import { useSettings } from '../components/useSettings'

const RUNGS: WordState[] = [...LADDER, 'ignored']

function useSummary(language?: Language): { summary?: WordsSummary; error?: string; reload: () => void } {
  const [summary, setSummary] = useState<WordsSummary>()
  const [error, setError] = useState<string>()
  const reload = useCallback(() => {
    if (!language) return
    window.duet.knowledge.summary(language).then(
      (next) => {
        setSummary(next)
        setError(undefined)
      },
      (cause) => setError(say(cause, 'Could not load your words.'))
    )
  }, [language])
  useEffect(() => {
    reload()
    const off = window.duet.knowledge.onChanged(reload)
    window.addEventListener('focus', reload)
    return () => {
      off()
      window.removeEventListener('focus', reload)
    }
  }, [reload])
  return { summary, error, reload }
}

export function Words(): React.JSX.Element {
  const settings = useSettings()
  const language = settings?.language
  const { summary, error, reload } = useSummary(language)
  const [rung, setRung] = useState<WordState>('known')
  const [actionError, setActionError] = useState<string>()
  const toggle = (key: string, ignored: boolean): void => {
    if (!language) return
    setActionError(undefined)
    window.duet.knowledge.setIgnored(language, key, ignored).catch((cause) => setActionError(say(cause, 'Could not change that word.')))
  }
  const shown = summary?.words.filter((word) => word.state === rung) ?? []
  const total = summary ? RUNGS.reduce((sum, state) => sum + summary.counts[state], 0) : 0
  return (
    <main className="home-page">
      <h1>Words</h1>
      <LoadState loaded={!!summary} error={error} reload={reload} />
      {actionError && (
        <p className="notice error" role="alert">
          {actionError}
        </p>
      )}
      {summary && total === 0 ? (
        <p className="muted">
          No {language ? languageName(language) : ''} words yet. Words you meet while watching show up here, and climb as you recall, say
          and use them.
        </p>
      ) : (
        summary && (
          <>
            <div className="words-rungs" role="tablist" aria-label="How well you know them">
              {RUNGS.map((state) => (
                <button key={state} type="button" role="tab" aria-selected={rung === state} className="words-rung" data-k={state} onClick={() => setRung(state)}>
                  <span className="words-count">{summary.counts[state]}</span>
                  <span>{STATE_LABELS[state]}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="muted">No words here yet.</p>
            ) : (
              <ul className="home-words" role="tabpanel">
                {shown.map((word) => (
                  <li key={word.key}>
                    <span className="w" data-k={word.state} lang={language}>
                      {word.seenAs}
                    </span>
                    {word.word !== word.seenAs.toLocaleLowerCase() && (
                      <span className="faint" lang={language}>
                        {word.word}
                      </span>
                    )}
                    <button type="button" className="btn quiet" onClick={() => toggle(word.key, word.state !== 'ignored')}>
                      {word.state === 'ignored' ? 'Bring back' : 'Ignore'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {summary.counts[rung] > shown.length && <p className="faint">Showing the {shown.length} you met most recently.</p>}
          </>
        )
      )}
    </main>
  )
}
