// A handful of usage events, sent to PostHog, to see where people stop: Duet opened, the welcome
// finished, the first line shown, a daily session done, a checkpoint taken. Each carries the install's
// anonymous id, the app's version and the OS, and at most the language learnt and the video site:
// never a line, a word, a title or an address. Sent under the same rules as crash reports
// (consent.ts): a built app, and "Share crash reports and usage" on.
//
// The project's key comes from MAIN_VITE_POSTHOG_KEY at build time (MAIN_VITE_POSTHOG_HOST for the
// EU cloud or another host); without it, nothing is sent.
import { app } from 'electron'
import { PostHog } from 'posthog-node'
import { readSetting, writeSetting } from '../store/db'
import { installId, reportsBuild, shareAllowed } from './consent'

export type UsageEvent =
  'app_opened' | 'onboarding_done' | 'first_line_shown' | 'daily_session_done' | 'checkpoint_taken'

type Properties = Record<string, string | number | boolean | undefined>

const ONCE_KEY = 'usage-once'

let client: PostHog | null | undefined

function posthog(): PostHog | undefined {
  if (client === undefined) {
    const key = import.meta.env.MAIN_VITE_POSTHOG_KEY
    client =
      key && reportsBuild()
        ? new PostHog(key, {
            host: import.meta.env.MAIN_VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
            // A few events a day: each goes at once, so none wait for a quit that may never come.
            flushAt: 1
          })
        : null
  }
  return client ?? undefined
}

/** Counts an event, when sharing is on. */
export function track(event: UsageEvent, properties: Properties = {}): void {
  if (!shareAllowed()) return
  const distinctId = installId()
  const sender = distinctId && posthog()
  if (!sender) return
  try {
    sender.capture({
      distinctId,
      event,
      disableGeoip: true,
      properties: {
        ...properties,
        app_version: app.getVersion(),
        os: process.platform,
        // No person profile: events by an anonymous id only.
        $process_person_profile: false
      }
    })
  } catch {
    // Counting must never get in the learner's way.
  }
}

let once: Set<string> | undefined

/** Counts an event the first time it happens on this install, and never again. */
export function trackOnce(event: UsageEvent, properties: Properties = {}): void {
  try {
    once ??= new Set(readSetting<string[]>(ONCE_KEY) ?? [])
    // Not marked as done unless it is sent (sharing on, in a build that sends).
    if (once.has(event) || !shareAllowed() || !posthog()) return
    once.add(event)
    writeSetting(ONCE_KEY, [...once])
  } catch {
    return
  }
  track(event, properties)
}

/** Sends what is still queued, before Duet quits. */
export function stopUsage(): Promise<void> {
  return client ? client.shutdown(2000) : Promise.resolve()
}
