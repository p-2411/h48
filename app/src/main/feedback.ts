// Feedback from the learner (Settings › Feedback, or the menu bar's Send feedback…): to Duet's server,
// which keeps it and forwards it to the team's Discord channel (server/src/feedback.js), and to Sentry
// as user feedback (next to that copy's errors) when crash reports are on. A build with neither opens
// an email to the team instead.
//   duet:send-feedback  { message, replyTo, details } → { sent: ('server' | 'sentry' | 'email')[] }
import * as Sentry from '@sentry/electron/main'
import { app, ipcMain, shell } from 'electron'
import { release } from 'os'
import type { Account } from './account'
import type { DuetServer } from './account/server'
import { reportsStarted } from './reports'
import { shareAllowed } from './reports/consent'
import type { Settings } from './settings'

const TEAM_EMAIL = 'hello@useduet.io'
const MAX_MESSAGE = 4000

export type FeedbackSent = { sent: ('server' | 'sentry' | 'email')[] }

export function connectFeedback({
  server,
  account,
  settings,
  owns
}: {
  server?: DuetServer
  account?: Account
  settings: Settings
  /** Whether a message came from one of Duet's own pages that may send feedback. */
  owns: (sender: Electron.WebContents) => boolean
}): void {
  ipcMain.handle('duet:send-feedback', async (event, raw: unknown): Promise<FeedbackSent> => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    const input = (raw ?? {}) as { message?: unknown; replyTo?: unknown; details?: unknown; place?: unknown }
    const message = typeof input.message === 'string' ? input.message.trim().slice(0, MAX_MESSAGE) : ''
    if (!message) throw new Error('Write something first.')
    const replyTo = input.replyTo === true
    const place = typeof input.place === 'string' ? input.place.slice(0, 40) : undefined
    // The app's version and the system only when the learner leaves them in.
    const details =
      input.details === false
        ? { place }
        : {
            version: app.getVersion(),
            platform: `${process.platform} ${release()}`,
            language: settings.current.language,
            place
          }
    const sent: FeedbackSent['sent'] = []
    if (server) {
      try {
        await server.request('/duet/feedback', { message, replyTo, details })
        sent.push('server')
      } catch {
        // Out of reach or signed out: Sentry, or the learner's email, below.
      }
    }
    if (reportsStarted() && shareAllowed()) {
      const email = replyTo ? (await account?.user().catch(() => null))?.email : undefined
      Sentry.captureFeedback({ message, ...(email && { email }), tags: { place: place ?? 'app' } })
      sent.push('sentry')
    }
    if (!sent.length) {
      // Neither is set up here (or Duet's server is out of reach): the learner's own email.
      const subject = encodeURIComponent('Duet feedback')
      const body = encodeURIComponent(`${message}\n\n—\nDuet ${app.getVersion()} · ${process.platform} ${release()}`)
      await shell.openExternal(`mailto:${TEAM_EMAIL}?subject=${subject}&body=${body}`)
      sent.push('email')
    }
    return { sent }
  })
}
