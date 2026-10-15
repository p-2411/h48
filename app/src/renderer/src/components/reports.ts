// Crash and error reports from a page: uncaught errors, unhandled rejections and views that crash
// (ErrorBoundary). They travel to the main process, which sends them only when sharing is on (see
// src/main/reports). Scrubbed here and again there: no line, word, chat, click target or console
// output leaves the page. Off while developing with the dev server.
import * as Sentry from '@sentry/electron/renderer'
import { scrubBreadcrumb, scrubEvent } from '../../../shared/report-scrub'

/** Starts reporting for this page. Call once, before rendering (each page's main.tsx). */
export function startReports(): void {
  if (import.meta.env.DEV) return
  Sentry.init({
    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== 'Breadcrumbs'),
      // Clicks name their target's text, and console output can hold a line: neither is kept.
      Sentry.breadcrumbsIntegration({ console: false, dom: false })
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb)
  })
}

/** A view that crashed and was caught by an ErrorBoundary. */
export function reportViewCrash(error: unknown, componentStack?: string | null): void {
  if (import.meta.env.DEV) return
  Sentry.captureException(error, {
    contexts: { react: { componentStack: componentStack ?? undefined } }
  })
}
