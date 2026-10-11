// The first run, in short steps: the language, how much of it in each line (shown on a sample line),
// on macOS the two permissions (each one's state live, so the learner sees it take), and what the
// colours mean (how well the learner knows each word). Windows asks for no permissions, so it skips
// that step. Every choice can be changed later in Settings, in the home base.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { joinTokens, mixedLine } from '../../../shared/levels'
import { LANGUAGE_CODES, languageModule, languageName } from '../../../shared/languages'
import { type AudioPermission, type Language, type Level, type OverlaySettings, type OverlayStatus } from '../../../shared/types'
import { Mascot } from '../components/Mascot'
import { SLIDE } from '../components/motion'
import { Words } from '../components/Words'
import { LADDER, STATE_LABELS, type WordState } from '../../../shared/knowledge'
import { LEVELS } from '../overlay/words'
import { Icon } from '../components/Icon'

// The sample line's words spread over the ladder, to show each colour (grammar words stay grey).
const DEMO: WordState[] = ['known', 'encountered', 'speakable', 'unknown', 'usable']
const demoState = (pair: number | null): WordState => (pair === null ? 'ignored' : DEMO[pair % DEMO.length])

const STEPS = (['Language', 'Level', 'Permissions', 'Colours'] as const).filter(
  (step) => step !== 'Permissions' || window.duet.welcome.asksPermissions
)
// How often the permission states are read again while that step is open.
const CHECK_MS = 1500

const AUDIO: Record<AudioPermission, string> = {
  granted: 'On',
  denied: 'Off — switch it on in System Settings',
  'not-asked': 'Not asked yet',
  unknown: 'Checking…',
  unavailable: 'Not available on this Mac'
}

function Check({ on, title, hint, state, children }: { on: boolean; title: string; hint: string; state: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="check card-box">
      <div className="row">
        <i className={`tick${on ? ' on' : ''}`} aria-hidden="true">
          {on && <Icon name="check" size={12} />}
        </i>
        <span className="grow">
          <b>{title}</b>
          <small className="muted">{hint}</small>
        </span>
        <span className={on ? 'ok' : 'faint'}>{state}</span>
      </div>
      {!on && children && <div className="row end">{children}</div>}
    </div>
  )
}

export function Welcome(): React.JSX.Element {
  const [step, setStep] = useState(0)
  // Which way the last move went (1: on, -1: back), so the step slides in from that side.
  const [direction, setDirection] = useState(1)
  const move = (by: 1 | -1): void => {
    setDirection(by)
    setStep((now) => now + by)
  }
  const [settings, setSettings] = useState<OverlaySettings>()
  const [status, setStatus] = useState<OverlayStatus>()
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    window.duet
      .getState()
      .then((state) => {
        setSettings(state.settings)
        setStatus(state.status)
      })
      .catch(() => setLoadError(true))
  }, [attempt])
  // The permissions change in System Settings, outside Duet: read them again while that step shows.
  useEffect(() => {
    if (STEPS[step] !== 'Permissions') return
    // A check that fails keeps the last answer; the next one tries again.
    const timer = setInterval(() => void window.duet.getState().then((state) => setStatus(state.status), () => undefined), CHECK_MS)
    return () => clearInterval(timer)
  }, [step])

  if (!settings)
    return (
      <main className="welcome">
        {loadError ? (
          <div className="notice error row" role="alert">
            <span>Duet could not load your settings.</span>
            <button
              type="button"
              className="btn quiet"
              onClick={() => {
                setLoadError(false)
                setAttempt((count) => count + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="faint" role="status">
            Loading…
          </p>
        )}
      </main>
    )
  const language = settings.language
  const sample = languageModule(language).sample
  const setLanguage = (next: Language): void => {
    window.duet.setLanguage(next)
    setSettings({ ...settings, language: next })
  }
  const setLevel = (next: Level): void => {
    window.duet.setLevel(next)
    setSettings({ ...settings, level: next })
  }
  const last = step === STEPS.length - 1
  const audio = status?.audio ?? 'unknown'

  return (
    <main className="welcome">
      <header>
        {step === 0 && (
          <div className="mascot-stage">
            <Mascot state="idle" scale={0.5} />
          </div>
        )}
        <h1>Welcome to Duet</h1>
        <p className="muted">Learn a language from what you already watch. Duet sits over YouTube and Netflix like subtitles.</p>
        <ol className="steps" aria-label="Steps">
          {STEPS.map((name, index) => (
            <li key={name} className={index === step ? 'now' : index < step ? 'done' : ''}>
              {name}
            </li>
          ))}
        </ol>
      </header>

      <section className="body">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div key={step} className="welcome-step" custom={direction} variants={SLIDE} initial="enter" animate="center" exit="leave">
        {STEPS[step] === 'Language' && (
          <>
            <h2>Which language are you learning?</h2>
            <div className="choices">
              {LANGUAGE_CODES.map((item) => (
                <button key={item} type="button" className="choice" aria-pressed={language === item} onClick={() => setLanguage(item)}>
                  <b>{languageName(item)}</b>
                  <span lang={item}>{joinTokens(languageModule(item).sample.source)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {STEPS[step] === 'Level' && (
          <>
            <h2>How much {languageName(language)} in each line?</h2>
            <p className="muted">Duet swaps some English words for {languageName(language)} ones. Auto starts with a few and brings in each word as you learn it; or choose how many.</p>
            <div className="segment wide" role="group" aria-label="Level">
              {LEVELS.map((item) => (
                <button key={item.level} type="button" aria-pressed={settings.level === item.level} onClick={() => setLevel(item.level)}>
                  {item.name}
                </button>
              ))}
            </div>
            <div className="sample card-box">
              <p className="mix" lang={settings.level === 5 ? language : undefined}>
                <Words tokens={mixedLine(sample, settings.level)} />
              </p>
              <p className="faint">
                Swaps in {LEVELS.find((item) => item.level === settings.level)!.adds} · “{sample.translation}”
              </p>
            </div>
          </>
        )}

        {STEPS[step] === 'Permissions' && (
          <>
            <h2>Two permissions</h2>
            <p className="muted">macOS asks for each one once. Duet uses them only while a video plays, and keeps nothing it hears.</p>
            <Check
              on={!!status?.trusted}
              title="Accessibility"
              hint="To read the captions on screen, and to pause and replay the video."
              state={status?.trusted ? 'On' : 'Off'}
            >
              <button type="button" className="btn" onClick={() => window.duet.welcome.openSettings('accessibility')}>
                Open System Settings
              </button>
            </Check>
            <Check
              on={audio === 'granted'}
              title="System Audio Recording"
              hint="To hear the video, so the words match what is said and Explain can hear the tone."
              state={AUDIO[audio]}
            >
              {audio === 'not-asked' ? (
                <button type="button" className="btn" onClick={() => window.duet.welcome.askAudio()}>
                  Allow
                </button>
              ) : (
                audio === 'denied' && (
                  <button type="button" className="btn" onClick={() => window.duet.welcome.openSettings('audio')}>
                    Open System Settings
                  </button>
                )
              )}
            </Check>
            <p className="faint">You can skip these for now. Duet tells you on the strip when it needs one.</p>
          </>
        )}

        {STEPS[step] === 'Colours' && (
          <>
            <h2>Each colour is how well you know the word</h2>
            <div className="sample card-box">
              <p className="mix">
                <Words tokens={mixedLine(sample, 4)} state={demoState} />
              </p>
            </div>
            <ul className="legend">
              {LADDER.map((state) => (
                <li key={state}>
                  <span className="swatch w" data-k={state} aria-hidden="true" />
                  {STATE_LABELS[state]}
                </li>
              ))}
            </ul>
            <p className="faint">Words climb as you meet them, recall them, say them and use them, and fall back if you forget.</p>
            <p className="muted">
              Hover the strip for the full line and the English. Hover a word for what it means, and <Icon name="star" size={13} /> to keep it.
              Drag the strip anywhere; <Icon name="settings" size={13} /> holds the rest.
            </p>
          </>
        )}
        </motion.div>
        </AnimatePresence>
      </section>

      <footer className="row">
        {step > 0 && (
          <button type="button" className="btn quiet" onClick={() => move(-1)}>
            Back
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn primary" onClick={() => (last ? window.duet.welcome.done() : move(1))}>
          {last ? 'Start watching' : 'Continue'}
        </button>
      </footer>
    </main>
  )
}
