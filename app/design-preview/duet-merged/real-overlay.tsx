// The app's own caption window, mounted in the onboarding preview: the real Overlay (Overlay.tsx,
// LineView.tsx, overlay.css and base.css, exactly as shipped), with a stand-in for the main process
// behind window.duet. It runs in a shadow root, so the app's styles apply to it alone, the way they
// do in its own window. The line is each language's real sample (shared/languages), and the stand-in
// tells the page what the learner does on the strip (a word looked at, a save, a level), which is
// how the try-it list ticks.
import '../../src/renderer/src/styles/base.css'
import '../../src/renderer/src/overlay/overlay.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionRoot } from '../../src/renderer/src/components/motion'
import { Overlay } from '../../src/renderer/src/overlay/Overlay'
import { languageModule } from '../../src/shared/languages'
import { joinTokens } from '../../src/shared/levels'
import { pairKeys, type WordState } from '../../src/shared/knowledge'
import type { Card, SaveResult } from '../../src/shared/cards'
import type { CheckpointView, Offer } from '../../src/shared/checkpoints'
import { DEFAULT_SETTINGS, type Language, type Level, type OverlayLine, type OverlaySettings, type OverlayStatus, type ProcessedLine } from '../../src/shared/types'

type Listener<T> = (value: T) => void
/** A channel the main process would send on: listeners in, a send out. */
function channel<T>(): { on: (listener: Listener<T>) => () => void; send: (value: T) => void } {
  const listeners = new Set<Listener<T>>()
  return {
    on: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    send: (value) => listeners.forEach((listener) => listener(value))
  }
}

export type OverlayDemo = {
  /** The line, in the language: still coming (the original only), or ready (words swapped in). */
  showLine: (ready: boolean) => void
  setLanguage: (language: Language) => void
  setLevel: (level: Level) => void
  /** The real sample line now on the strip. */
  sample: () => ProcessedLine
  /** What the learner does on the strip. */
  on: {
    word: (listener: Listener<string>) => () => void
    save: (listener: Listener<Card>) => () => void
    level: (listener: Listener<Level>) => () => void
    /** A checkpoint opened, answered (done) or left (close). */
    checkpoint: (listener: Listener<'open' | 'done' | 'close'>) => () => void
  }
  /** A checkpoint offered: the strip glows, as at the end of a scene. */
  offer: () => void
}

// How well the demo learner knows the sample's words, in order of the line's pairs (the rest new):
// enough rungs that the strip shows the colours the onboarding talks about.
// The question about each language's sample line (it's about a sister and a new car).
const QUESTION: Partial<Record<Language, string>> = {
  es: 'What did the speaker’s sister do?',
  ja: 'What did the speaker’s sister do?',
  ko: 'What did the speaker’s sister do?'
}

const RUNGS: WordState[] = ['unknown', 'encountered', 'known', 'unknown', 'speakable', 'usable']

export function mountOverlay(host: HTMLElement, css: string): OverlayDemo {
  let settings: OverlaySettings = { ...DEFAULT_SETTINGS, onboarded: true, level: 3 }
  const status: OverlayStatus = { trusted: true, playing: true, audio: 'granted', source: 'transcript', site: 'youtube', siteName: 'YouTube', url: 'https://www.youtube.com/watch?v=duet-demo' }
  const statusCh = channel<OverlayStatus>(), settingsCh = channel<OverlaySettings>(), lineCh = channel<OverlayLine>()
  const currentCh = channel<number | null>(), knowledgeCh = channel<void>()
  const word = channel<string>(), save = channel<Card>(), level = channel<Level>()
  const offerCh = channel<Offer | null>(), closedCh = channel<void>(), checkpoint = channel<'open' | 'done' | 'close'>()
  let lineId = 0
  const sample = (): ProcessedLine => languageModule(settings.language).sample
  const states = (language: Language): Record<string, WordState> =>
    Object.fromEntries(pairKeys(language, languageModule(language).sample).map((w, i) => [w.key, RUNGS[i] ?? 'unknown']))
  const nothing = (): (() => void) => () => undefined
  const setSettings = (next: Partial<OverlaySettings>): void => {
    settings = { ...settings, ...next }
    settingsCh.send(settings)
  }

  // window.duet, as src/preload/overlay.ts gives it: what the strip reads and the calls it makes.
  ;(window as unknown as { duet: unknown }).duet = {
    getState: async () => ({ settings, status, fit: null }),
    onStatus: statusCh.on,
    onFit: nothing,
    onSettings: settingsCh.on,
    onLive: nothing,
    onLine: lineCh.on,
    onCurrent: currentCh.on,
    setLanguage: (language: Language) => setSettings({ language }),
    setLevel: (next: Level) => { setSettings({ level: next }); level.send(next) },
    setGuessFirst: (guessFirst: boolean) => setSettings({ guessFirst }),
    setWaitForTranslation: (waitForTranslation: boolean) => setSettings({ waitForTranslation }),
    setCheckpoints: () => undefined,
    setPauseForHelp: (pauseForHelp: boolean) => setSettings({ pauseForHelp }),
    setShowFullLine: (showFullLine: boolean) => setSettings({ showFullLine }),
    setWordScript: (wordScript: OverlaySettings['wordScript']) => setSettings({ wordScript }),
    showMenu: () => undefined,
    save: async (_lineId?: number, pair?: number): Promise<SaveResult> => {
      const line = sample()
      const expression = pair === undefined ? joinTokens(line.source) : joinTokens(line.source.filter((t) => t.pair === pair))
      const meaning = pair === undefined ? line.translation : joinTokens(line.english.filter((t) => t.pair === pair))
      const now = Date.now()
      const card = { id: `demo-${now}`, expression, meaning, revision: 1, paused: false, due: now, reps: 0, lapses: 0, createdAt: now, updatedAt: now } as unknown as Card
      save.send(card)
      return { saved: card }
    },
    unsave: () => undefined,
    restore: async () => undefined,
    replay: () => undefined,
    hoveredWord: (_lineId: number, text: string) => word.send(text),
    playOn: () => undefined,
    setSolid: () => undefined,
    drag: () => undefined,
    setShortcut: async () => undefined,
    // Talking runs the live tutor, which needs the app; the strip says so if pressed here.
    talkHere: {
      start: () => Promise.reject(new Error('Talking to Duet works in the app.')),
      toText: async () => undefined,
      end: async () => undefined,
      onKeys: nothing
    },
    tutor: { onActionResult: nothing },
    setReminder: async () => undefined,
    openSettings: () => undefined,
    showScript: () => undefined,
    explainLine: () => undefined,
    cards: { open: () => undefined },
    knowledge: {
      states: async (language: Language, keys: string[]) => {
        const all = states(language)
        return Object.fromEntries(keys.filter((key) => key in all).map((key) => [key, all[key]]))
      },
      onChanged: knowledgeCh.on
    },
    // A checkpoint: "What did they mean?" about the sample line. The app asks and marks it with its
    // text model; here the question is the line's own and the note is kind either way.
    checkpoint: {
      onOffer: offerCh.on,
      onClosed: closedCh.on,
      open: async (): Promise<CheckpointView> => {
        offerCh.send(null)
        checkpoint.send('open')
        return { kind: 'meaning', original: joinTokens(sample().source) }
      },
      meaningQuestion: async () => ({ question: QUESTION[settings.language] ?? 'What is the speaker telling us?' }),
      meaningCheck: async (answer: string) => {
        await new Promise((r) => setTimeout(r, 700))
        const meaning = sample().translation
        const close = /car|coche|車|차|bought|buy/i.test(answer)
        return { note: close ? `Yes! “${meaning}” You got it.` : `Good try. It means “${meaning}”` }
      },
      speak: () => Promise.reject(new Error('Only in the app.')),
      coach: () => Promise.reject(new Error('Only in the app.')),
      checkRecall: () => Promise.reject(new Error('Only in the app.')),
      produceCheck: () => Promise.reject(new Error('Only in the app.')),
      done: async () => { checkpoint.send('done') },
      close: async () => { checkpoint.send('close') },
      takeKeyboard: () => undefined
    },
    welcome: { asksPermissions: false, openSettings: () => undefined }
  }

  // The window's own page, in a shadow root: base.css's :root is the host here.
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css.replace(/:root\b/g, ':host').replace(/html,\s*body,\s*#root/g, ':host, #root')
  const root = document.createElement('div')
  root.id = 'root'
  shadow.replaceChildren(style, root)
  createRoot(root).render(
    <StrictMode>
      <MotionRoot>
        <Overlay />
      </MotionRoot>
    </StrictMode>
  )

  return {
    showLine: (ready) => {
      const line = sample()
      const id = ++lineId
      lineCh.send({ id, original: joinTokens(line.source), at: Date.now(), state: ready ? 'ready' : 'pending', processed: ready ? line : undefined })
      currentCh.send(id)
    },
    setLanguage: (language) => {
      setSettings({ language })
      knowledgeCh.send()
    },
    setLevel: (next) => setSettings({ level: next }),
    sample,
    on: { word: word.on, save: save.on, level: level.on, checkpoint: checkpoint.on },
    offer: () => offerCh.send('break')
  }
}
