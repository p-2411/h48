// The real caption strip on the first run's video: Overlay.tsx in a frame (welcome-strip.html), its
// calls to window.duet answered here by a demo of the app (as design-preview/duet-merged/real-overlay.tsx
// does), so the learner tries the real strip (its hover row, word card, Save, level circle and a
// checkpoint) and nothing they do on it reaches their cards or settings. The page hears what they do
// through `on`: a word looked at, a save, a level, a checkpoint.
import { pairKeys, type WordState } from '../../../shared/knowledge'
import { languageModule, type Language } from '../../../shared/languages'
import { joinTokens } from '../../../shared/levels'
import type { Card, SaveResult } from '../../../shared/cards'
import type { CheckpointView, Offer } from '../../../shared/checkpoints'
import { DEFAULT_SETTINGS, type Level, type OverlayLine, type OverlaySettings, type OverlayStatus, type ProcessedLine } from '../../../shared/types'
import { isBridgeMessage, type FromStrip, type ToStrip } from './strip/bridge'

type Listener<T> = (value: T) => void
export type SavedWord = { expression: string; meaning: string }
export type CheckpointPhase = 'open' | 'done' | 'close'

export type Strip = {
  setLanguage: (language: Language) => void
  setLevel: (level: Level) => void
  /** The line: still coming (the original only), or ready (words swapped in). */
  showLine: (ready: boolean) => void
  sample: () => ProcessedLine
  /** A checkpoint offered: the strip glows, as at the end of a scene. */
  offer: () => void
  on: {
    word: (listener: Listener<string>) => () => void
    save: (listener: Listener<SavedWord>) => () => void
    level: (listener: Listener<Level>) => () => void
    checkpoint: (listener: Listener<CheckpointPhase>) => () => void
  }
}

/** Listeners in, a send out; a `sticky` one hands its latest value to a listener that comes late
 * (the strip's frame may load after the first line is shown). */
function channel<T>(sticky = false): { on: (listener: Listener<T>) => () => void; send: (value: T) => void } {
  const listeners = new Set<Listener<T>>()
  let latest: { value: T } | undefined
  return {
    on: (listener) => {
      listeners.add(listener)
      if (sticky && latest) listener(latest.value)
      return () => listeners.delete(listener)
    },
    send: (value) => {
      if (sticky) latest = { value }
      listeners.forEach((listener) => listener(value))
    }
  }
}

// How well the demo learner knows the sample's words, in order of the line's pairs (the rest new):
// enough rungs that the strip shows the colours Duet talks about.
const RUNGS: WordState[] = ['unknown', 'encountered', 'known', 'unknown', 'speakable', 'usable']

export function mountStrip(host: HTMLElement): Strip {
  let settings: OverlaySettings = { ...DEFAULT_SETTINGS, onboarded: true, level: 3 }
  const status: OverlayStatus = { trusted: true, playing: true, audio: 'granted', source: 'transcript', site: 'youtube', siteName: 'YouTube', url: 'https://www.youtube.com/watch?v=duet-demo' }
  const statusCh = channel<OverlayStatus>(), settingsCh = channel<OverlaySettings>(), lineCh = channel<OverlayLine>(true)
  const currentCh = channel<number | null>(true), knowledgeCh = channel<void>()
  const word = channel<string>(), saved = channel<SavedWord>(), level = channel<Level>()
  const offerCh = channel<Offer | null>(), closedCh = channel<void>(), checkpoint = channel<CheckpointPhase>()
  let lineId = 0
  const sample = (): ProcessedLine => languageModule(settings.language).sample
  const states = (language: Language): Record<string, WordState> =>
    Object.fromEntries(pairKeys(language, languageModule(language).sample).map((w, i) => [w.key, RUNGS[i] ?? 'unknown']))
  const setSettings = (next: Partial<OverlaySettings>): void => {
    settings = { ...settings, ...next }
    settingsCh.send(settings)
  }

  // The app, as the strip sees it through window.duet (src/preload/overlay.ts): what it reads and
  // the calls it makes. Anything not here answers with nothing.
  const demo = {
    getState: async () => ({ settings, status, fit: null }),
    onStatus: statusCh.on,
    onSettings: settingsCh.on,
    onLine: lineCh.on,
    onCurrent: currentCh.on,
    setLanguage: (language: Language) => setSettings({ language }),
    setLevel: (next: Level) => {
      setSettings({ level: next })
      level.send(next)
    },
    setGuessFirst: (guessFirst: boolean) => setSettings({ guessFirst }),
    setWaitForTranslation: (waitForTranslation: boolean) => setSettings({ waitForTranslation }),
    setPauseForHelp: (pauseForHelp: boolean) => setSettings({ pauseForHelp }),
    setShowFullLine: (showFullLine: boolean) => setSettings({ showFullLine }),
    setWordScript: (wordScript: OverlaySettings['wordScript']) => setSettings({ wordScript }),
    save: async (_lineId?: number, pair?: number): Promise<SaveResult> => {
      const line = sample()
      const expression = pair === undefined ? joinTokens(line.source) : joinTokens(line.source.filter((t) => t.pair === pair))
      const meaning = pair === undefined ? line.translation : joinTokens(line.english.filter((t) => t.pair === pair))
      const now = Date.now()
      const card = { id: `demo-${now}`, expression, meaning, revision: 1, paused: false, due: now, reps: 0, lapses: 0, createdAt: now, updatedAt: now } as unknown as Card
      saved.send({ expression, meaning })
      return { saved: card }
    },
    hoveredWord: (_lineId: number, text: string) => word.send(text),
    // Talking runs the live tutor, which needs the app; the strip says so if it's pressed here.
    talkHere: { start: () => Promise.reject(new Error('Talking to Duet works in the app.')) },
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
      meaningQuestion: async () => ({ question: 'What did the speaker’s sister do?' }),
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
      done: async () => checkpoint.send('done'),
      close: async () => checkpoint.send('close')
    }
  }

  // The frame, and the calls and subscriptions that come from it.
  const frame = document.createElement('iframe')
  frame.className = 'strip-frame'
  frame.title = 'Duet’s caption strip'
  const unsubscribe = new Map<number, () => void>()
  const send = (message: ToStrip): void => frame.contentWindow?.postMessage(message, '*')
  const find = (path: string[]): unknown => path.reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], demo)
  addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow || !isBridgeMessage(event.data)) return
    const message = event.data as FromStrip
    if (message.duetStrip === 'off') {
      unsubscribe.get(message.sub)?.()
      unsubscribe.delete(message.sub)
    } else if (message.duetStrip === 'on') {
      const subscribe = find(message.path)
      if (typeof subscribe === 'function')
        unsubscribe.set(message.sub, subscribe((value: unknown) => send({ duetStrip: 'event', sub: message.sub, value })))
    } else {
      const call = find(message.path)
      try {
        const value = typeof call === 'function' ? await call(...message.args) : undefined
        send({ duetStrip: 'result', id: message.id, ok: true, value })
      } catch (error) {
        send({ duetStrip: 'result', id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
  })
  frame.src = new URL('./welcome-strip.html', document.baseURI).href
  host.replaceChildren(frame)

  return {
    setLanguage: (language) => {
      setSettings({ language })
      knowledgeCh.send()
    },
    setLevel: (next) => setSettings({ level: next }),
    showLine: (ready) => {
      const line = sample()
      const id = ++lineId
      lineCh.send({ id, original: joinTokens(line.source), at: Date.now(), state: ready ? 'ready' : 'pending', processed: ready ? line : undefined })
      currentCh.send(id)
    },
    sample,
    offer: () => offerCh.send('break'),
    on: { word: word.on, save: saved.on, level: level.on, checkpoint: checkpoint.on }
  }
}
