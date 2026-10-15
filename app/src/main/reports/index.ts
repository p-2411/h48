// Crash and error reports, sent to Sentry. Covers the main process (uncaught errors, unhandled
// rejections), every page (their errors come here over IPC and leave from here), Electron's own
// processes crashing (native crash dumps, a page or the GPU process gone), the caption and audio
// readers stopping, and failed model requests (grouped: one outage is one issue, not thousands).
//
// Privacy: nothing the learner watched, heard or said is sent. Every event passes scrubEvent
// (shared/report-scrub.ts) and every breadcrumb scrubBreadcrumb; local variables, console output,
// clicks and screenshots are never collected. Nothing at all is sent while "Share crash reports and
// usage" is off in Settings, or when Duet runs from source (DUET_REPORTS=on to try it there).
//
// The project's address comes from MAIN_VITE_SENTRY_DSN at build time; without it, nothing is sent.
// What is collected is listed in app/README.md (Crash reports and usage).
import * as Sentry from '@sentry/electron/main'
import { app, type WebContents } from 'electron'
import { scrubBreadcrumb, scrubEvent } from '../../shared/report-scrub'
import { onModelFailure, type ModelFailure } from '../ai/report'
import { installId, reportsBuild, shareAllowed } from './consent'

export { followConsent } from './consent'

// A failure of the same kind is sent at most this often; Sentry counts it as one issue anyway.
const SAME_FAILURE_EVERY_MS = 10 * 60_000

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

/** Starts reporting. Call once, before the app is ready (index.ts does, first thing). */
export function startReports(): void {
  const dsn = import.meta.env.MAIN_VITE_SENTRY_DSN
  if (started || !dsn || !reportsBuild()) return
  started = true
  const offline = Sentry.makeElectronOfflineTransport()
  Sentry.init({
    dsn,
    release: `duet@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    sendDefaultPii: false,
    // Nothing leaves while sharing is off: not errors, not crash dumps, not session counts.
    transport: (options) => {
      const transport = offline(options)
      return {
        send: (envelope) => (shareAllowed() ? transport.send(envelope) : Promise.resolve({})),
        flush: (timeout) => transport.flush(timeout)
      }
    },
    integrations: (defaults) =>
      defaults.filter(
        (integration) =>
          // Console output can hold a line; local variables can hold anything; screenshots show the
          // strip.
          !['Console', 'LocalVariables', 'Screenshots'].includes(integration.name)
      ),
    initialScope: { user: { id: installId() } },
    getRendererName: pageName,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb)
  })
  onModelFailure(reportModelFailure)
}

/** Reports an error caught and handled somewhere Duet carries on from. */
export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  if (started) Sentry.captureException(error, { tags })
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
