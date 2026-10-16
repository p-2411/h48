// Local only (landing-page capture): the real voice bar, as Talk shows it while voice is on and
// listening, in place of the message box. Nothing behind it is live.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceBar } from '../src/renderer/src/explain/VoiceBar'
import type { LiveTutor } from '../src/renderer/src/explain/voice/useLiveTutor'

export function injectVoiceBar(composer: HTMLElement): Promise<void> {
  const nothing = (): void => undefined
  const live = { usageSeconds: 14, muted: false, tutorMuted: false, speakerBlocked: false, toggleMicrophone: nothing, retryTutorAudio: nothing, toggleTutorAudio: nothing, requestPronunciationCheck: nothing, end: nothing } as unknown as LiveTutor
  composer.replaceChildren()
  createRoot(composer).render(createElement(VoiceBar, { live, status: 'listening', endButton: { current: null } }))
  return new Promise((done) => setTimeout(done, 300))
}
