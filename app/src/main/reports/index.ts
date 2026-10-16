// Crash and error reports, sent to Sentry. Covers the main process (uncaught errors, unhandled
// rejections), every page (their errors come here over IPC and leave from here), Electron's own
// processes going away (a page or the GPU process crashed, killed or out of memory), the caption and
// audio readers stopping, and failed model requests (grouped: one outage is one issue, not
// thousands). A native crash of the main process shows as a crashed session in release health.
//
// Privacy: nothing the learner watched, heard or said is sent. Every event passes scrubEvent
// (shared/report-scrub.ts), which keeps only messages of known shapes, and every breadcrumb
// scrubBreadcrumb. Local variables, console output, clicks, screenshots and native crash dumps (a
// page's memory can hold a line) are never collected. Reports wait in memory only, never on disk,
// and nothing at all is sent while "Share crash reports and usage" is off in Settings, or when Duet
// runs from source (DUET_REPORTS=on to try it there).
//
// The project's address comes from MAIN_VITE_SENTRY_DSN at build time; without it, nothing is sent.
// What is collected is listed in app/README.md (Crash reports and usage).
import * as Sentry from '@sentry/electron/main'
import { app, ipcMain, type WebContents } from 'electron'
import type { OverlaySettings } from '../../shared/types'
import { scrubBreadcrumb, scrubEvent } from '../../shared/report-scrub'
import { onModelFailure, type ModelFailure } from '../ai/report'
import type { Settings } from '../settings'
import { followConsent as followSettings, installId, reportsBuild, shareAllowed } from './consent'

// A failure of the same kind is sent at most this often; Sentry counts it as one issue anyway.
const SAME_FAILURE_EVERY_MS = 10 * 60_000
// Reports waiting for the network, at most; the oldest wait first.
const QUEUE_SIZE = 30

// Each page by its window: index.html is the strip.
const PAGES: Record<string, string> = {
  index: 'strip',
  panel: 'panel',
  home: 'home',
  welcome: 'welcome'
}

function pageName(contents: WebContents): string | undefined {
  const page = /\/(\w+)\.html/.exec(contents.getURL())?.[1]
  return page ? PAGES[page] : undefined
}

let started = false

// Reports that could not be sent yet (offline). In memory only: Sentry's own queue keeps them on disk,
// where they would go out later even after sharing was turned off.
let queue: unknown[] = []

function memoryStore<E>(): {
  push(envelope: E): Promise<void>
  unshift(envelope: E): Promise<void>
  shift(): Promise<E | undefined>
} {
  return {
    push: async (envelope) => {
      if (queue.length < QUEUE_SIZE) queue.push(envelope)
    },
    unshift: async (envelope) => {
      queue.unshift(envelope)
    },
    shift: async () => queue.shift() as E | undefined
  }
}

/** Starts reporting, in the one Duet that holds the single-instance lock. Call once, before the app
 * is ready (index.ts does). Pages ask whether it started (duet:reports), and report only if so. */
export function startReports(): void {
  ipcMain.on('duet:reports', (event) => {
    event.returnValue = started
  })
  const dsn = import.meta.env.MAIN_VITE_SENTRY_DSN
  if (started || !dsn || !reportsBuild()) return
  started = true
  Sentry.init({
    dsn,
    release: `duet@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    sendDefaultPii: false,
    // Nothing leaves while sharing is off, and nothing waits for later: not errors, not session
    // counts, not reports that were waiting for the network.
    transportOptions: {
      createStore: () => memoryStore(),
      flushAtStartup: false,
      shouldSend: () => shareAllowed(),
      shouldStore: () => shareAllowed()
    },
    integrations: (defaults) => [
      ...defaults.filter(
        (integration) =>
          // Console output can hold a line; local variables can hold anything; screenshots show the
          // strip; a native crash dump holds a process's memory, lines included.
          !['Console', 'LocalVariables', 'Screenshots', 'SentryMinidump', 'ChildProcess'].includes(
            integration.name
          )
      ),
      // Without crash dumps, a process going away is reported here instead: its type and reason only.
      Sentry.childProcessIntegration({
        events: ['crashed', 'oom', 'abnormal-exit', 'launch-failed', 'integrity-failure']
      })
    ],
    initialScope: { user: { id: installId() } },
    getRendererName: pageName,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb)
  })
  onModelFailure(reportModelFailure)
}

/** Whether crash reports started in this copy (a built app with Sentry's key). */
export function reportsStarted(): boolean {
  return started
}

/** From here on, sharing follows Settings; turning it off also drops reports still waiting. */
export function followConsent(settings: Settings): void {
  followSettings(settings)
  settings.on('change', (current: OverlaySettings) => {
    if (!current.shareDiagnostics) queue = []
  })
}

/** A caption or audio reader stopped while Duet still needed it, or could not start. */
export function reportHelperExit(
  helper: 'caption-reader' | 'audio-reader',
  how: { code?: number | null; signal?: string | null; error?: string }
): void {
  if (!started) return
  const why = how.error ?? how.signal ?? `code ${how.code}`
  Sentry.captureMessage(`The ${helper} stopped (${why})`, {
    level: 'error',
    tags: { helper, 'helper.exit': why },
    fingerprint: ['helper-exit', helper, why]
  })
}

const lastSent = new Map<string, number>()

function reportModelFailure(failure: ModelFailure): void {
  const key = [failure.provider, failure.task, failure.kind].join('/')
  const now = Date.now()
  if (now - (lastSent.get(key) ?? 0) < SAME_FAILURE_EVERY_MS) return
  lastSent.set(key, now)
  // Its own error, made here: the original's message can quote what was sent.
  const error = new Error(`${failure.provider} ${failure.task} failed: ${failure.kind}`)
  error.name = 'ModelFailure'
  Sentry.captureException(error, {
    level: failure.kind === 'network' ? 'warning' : 'error',
    tags: {
      'ai.provider': failure.provider,
      'ai.model': failure.model ?? 'unknown',
      'ai.task': failure.task,
      'ai.kind': failure.kind,
      'ai.error': failure.name
    },
    fingerprint: ['ai', failure.provider, failure.task, failure.kind]
  })
}
