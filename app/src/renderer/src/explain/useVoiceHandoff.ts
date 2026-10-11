// Moving between text and voice. When voice starts, focus goes to End voice (the mic button that had
// it is gone). When voice stops, its turns join the thread (each voice session starts with none), the
// video may play again and focus returns to the message box.
import { useEffect, useRef, type RefObject } from 'react'
import { speaks, type Language } from '../../../shared/languages'
import { focusMessageBox } from './focus'
import { ENGLISH_HELP_DELAY_MS } from './voice/timing'
import { voiceTurns, type VoiceTurn } from './thread'
import { isConnected, isVoiceOn, type LiveTutor } from './voice/useLiveTutor'

/** Hands over between voice and text (`onTurns` keeps a finished voice conversation's turns in the
 * thread); returns the ref for the End voice button. */
export function useVoiceHandoff(
  live: LiveTutor,
  box: RefObject<HTMLTextAreaElement | null>,
  onTurns: (turns: VoiceTurn[]) => void
): RefObject<HTMLButtonElement | null> {
  const endButton = useRef<HTMLButtonElement>(null)
  const voiceOn = isVoiceOn(live.status)
  const wasOn = useRef(false)
  const { transcripts } = live
  useEffect(() => {
    if (voiceOn) {
      if (!wasOn.current) endButton.current?.focus()
      wasOn.current = true
      return
    }
    if (!wasOn.current) return
    wasOn.current = false
    const turns = transcripts.filter((turn) => turn.text.trim())
    if (turns.length) onTurns(voiceTurns(turns))
    window.duet.tutor.voiceEnded()
    focusMessageBox(box)
  }, [voiceOn, transcripts, box, onTurns])
  return endButton
}

/** In voice, a pause after Duet's turn in the language offers help in English, once per turn and
 * not for a turn whose meaning the learner already showed. */
export function useEnglishHelp(live: LiveTutor, language: Language, revealed: Set<string>, wasRevealed: (id: string) => boolean): void {
  const connected = isConnected(live.status)
  const last = live.transcripts.at(-1)
  const { offerEnglishHelp } = live
  const offered = useRef(new Set<string>())
  useEffect(() => {
    if (!connected || !last || last.role !== 'tutor' || !speaks(language, last.text)) return
    if (revealed.has(last.id) || wasRevealed(last.id) || offered.current.has(last.id)) return
    const timer = window.setTimeout(() => {
      offered.current.add(last.id)
      offerEnglishHelp()
    }, ENGLISH_HELP_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [connected, last, language, offerEnglishHelp, revealed, wasRevealed])
}
