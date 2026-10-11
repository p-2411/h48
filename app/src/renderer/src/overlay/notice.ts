// What the strip says about the state of things. Normal running says nothing (a dot, with these
// words on hover); words show on the strip only when the learner can do something about it.
import { LANGUAGES, type Language, type OverlayStatus } from '../../../shared/types'

export type Notice = {
  text: string
  /** Something to do about it, when there is one. */
  action?: { label: string; run: () => void }
}

/** A notice the learner should see and can act on, or undefined when all is well. */
export function actionable(status: OverlayStatus, language: Language): Notice | undefined {
  const name = LANGUAGES[language]
  if (status.error) return { text: status.error }
  if (status.modelError) return { text: status.modelError }
  if (!status.trusted)
    return {
      text: 'Duet needs Accessibility permission to see the video',
      action: { label: 'Open settings', run: () => window.duet.welcome.openSettings('accessibility') }
    }
  if (status.waiting) return { text: 'Paused while this line translates', action: { label: 'Play on', run: window.duet.playOn } }
  const other = status.otherLanguage ?? (status.spokenLanguage && { language: status.spokenLanguage.language, from: 'spoken' as const })
  if (other) {
    if (other.language !== 'other') {
      const found = other.language
      const what = other.from === 'captions' ? 'Captions are' : 'This video is'
      return { text: `${what} in ${LANGUAGES[found]}`, action: { label: `Switch to ${found.toUpperCase()}`, run: () => window.duet.setLanguage(found) } }
    }
    if (other.from === 'captions') return { text: `These captions aren’t in ${name}. Choose ${name} in the player` }
    if (status.spokenLanguage) return { text: `Spoken in ${status.spokenLanguage.name}: the subtitles are a translation` }
    return { text: `This video isn’t in ${name}` }
  }
  return undefined
}

/** Where things stand, for the dot's hover text. */
export function quiet(status: OverlayStatus, language: Language): { text: string; on: boolean } {
  const browser = status.browser ?? 'your browser'
  if (!status.url) return { text: `Open a ${LANGUAGES[language]} video on YouTube or Netflix`, on: false }
  if (status.source === 'transcript') return { text: `Following the transcript in ${browser}`, on: true }
  if (status.source === 'audio') return { text: `Listening to the video in ${browser}`, on: true }
  if (status.captions) return { text: `Reading ${status.siteName ?? 'the video'} in ${browser}`, on: true }
  return { text: 'Turn on captions, or Duet will listen', on: false }
}
