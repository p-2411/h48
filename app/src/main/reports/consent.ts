// Whether Duet may send crash reports and usage events, and the anonymous id they carry.
//
// Reports are sent only from a built app (run from source, set DUET_REPORTS=on to try them), and only
// while "Share crash reports and usage" is on in Settings. The setting is read straight from the
// database at first, so a crash before Settings exists still asks it; after that it follows Settings.
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { OverlaySettings } from '../../shared/types'
import type { Settings } from '../settings'
import { readSetting, writeSetting } from '../store/db'

const INSTALL_KEY = 'install-id'

/** Whether this copy of Duet sends anything at all: a built app, or DUET_REPORTS=on. */
export function reportsBuild(): boolean {
  return app.isPackaged || process.env.DUET_REPORTS === 'on'
}

let consent: boolean | undefined

/** The learner's choice in Settings, right now. */
export function shareAllowed(): boolean {
  if (consent === undefined) {
    try {
      consent = readSetting<Partial<OverlaySettings>>('overlay')?.shareDiagnostics !== false
    } catch {
      // The database can't be read: without the learner's answer, nothing is sent.
      return false
    }
  }
  return consent
}

/** From here on, the choice follows Settings: turning it off stops sending at once. */
export function followConsent(settings: Settings): void {
  consent = settings.current.shareDiagnostics
  settings.on('change', (current: OverlaySettings) => {
    consent = current.shareDiagnostics
  })
}

let id: string | undefined

/** A random id for this install, made on first use. It names no one: it only tells one install's
 * reports from another's. (With sign-in, the account's id can be added next to it.) */
export function installId(): string | undefined {
  if (id) return id
  try {
    id = readSetting<string>(INSTALL_KEY)
    if (!id) {
      id = randomUUID()
      writeSetting(INSTALL_KEY, id)
    }
  } catch {
    return undefined
  }
  return id
}
