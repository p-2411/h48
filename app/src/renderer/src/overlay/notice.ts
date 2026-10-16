// What the strip says about the state of things. Normal running says nothing (a coloured dot, with
// its words on hover); words show on the strip only when the learner can do something about it.
import { languageName } from '../../../shared/languages'
import { siteList, type Language, type OverlayStatus } from '../../../shared/types'

export type Notice = {
  text: string
  /** Something to do about it, when there is one. */
  action?: { label: string; run: () => void }
}

/** A notice the learner should see and can act on, or undefined when all is well. */
export function actionable(status: OverlayStatus, language: Language): Notice | undefined {
  const name = languageName(language)
  if (status.error) return { text: status.error }
  if (status.modelError) return { text: status.modelError }
  // Windows asks for no permission: until its caption reader reports, Duet is only starting.
  // (Outside a window, in the tests, as on macOS.)
  const asksPermissions = typeof window === 'undefined' || window.duet.welcome.asksPermissions
  if (!status.trusted && !asksPermissions) return { text: 'Duet is starting…' }
  if (!status.trusted)
    return {
      text: 'Duet needs Accessibility permission to see the video',
      action: {
        label: 'Open System Settings',
        run: () => window.duet.welcome.openSettings('accessibility')
      }
    }
  if (status.waiting)
    return {
      text: 'Paused while this line translates',
      action: { label: 'Play on', run: window.duet.playOn }
    }
  const other =
    status.otherLanguage ??
    (status.spokenLanguage && { language: status.spokenLanguage.language, from: 'spoken' as const })
  if (other) {
    if (other.language !== 'other') {
      const found = other.language
      const what = other.from === 'captions' ? 'Captions are' : 'This video is'
      return {
        text: `${what} in ${languageName(found)}`,
        action: {
          label: `Switch to ${found.toUpperCase()}`,
          run: () => window.duet.setLanguage(found)
        }
      }
    }
    if (other.from === 'captions')
      return { text: `These captions aren’t in ${name}. Choose ${name} in the player` }
    if (status.spokenLanguage)
      return { text: `Spoken in ${status.spokenLanguage.name}: the subtitles are a translation` }
    return { text: `This video isn’t in ${name}` }
  }
  return undefined
}

/** Where things stand when all is well, for the dot's hover text (and the strip with no line). */
export function quiet(status: OverlayStatus, language: Language): { text: string; on: boolean } {
  const browser = status.browser ?? 'your browser'
  if (!status.url)
    return { text: `Open a ${languageName(language)} video on ${siteList()}`, on: false }
  if (status.source === 'transcript')
    return { text: `Following the transcript in ${browser}`, on: true }
  if (status.source === 'audio') return { text: `Listening to the video in ${browser}`, on: true }
  if (status.captions)
    return { text: `Reading ${status.siteName ?? 'the video'} in ${browser}`, on: true }
  return { text: 'Turn on captions, or Duet will listen', on: false }
}

/** The status dot: red when something is wrong (the strip says what), pulsing yellow while a line
 * is translating or still forming, green while lines come through, grey with nothing to follow. */
export type Tone = 'ok' | 'busy' | 'error' | 'off'

export function statusDot(
  status: OverlayStatus,
  language: Language,
  line: { translating: boolean; failed: boolean; building: boolean }
): { tone: Tone; text: string } {
  if (status.waiting) return { tone: 'busy', text: 'Paused while this line translates' }
  const notice = actionable(status, language)
  if (notice) return { tone: 'error', text: notice.text }
  if (line.translating) return { tone: 'busy', text: 'Translating the line' }
  if (line.failed) return { tone: 'error', text: 'This line could not be translated' }
  if (line.building) return { tone: 'busy', text: 'Reading the line' }
  const state = quiet(status, language)
  return { tone: state.on ? 'ok' : 'off', text: state.text }
}
