// Talking to Duet from the strip (src/main/talk/strip.ts): the mascot button or the talk keys open
// the conversation, any time (about the line on screen, or free when there is none), and start voice
// at once; the video waits while it is live. End closes it (the video goes on); Text chat goes on in
// writing (Explain on that line, or Talk in the home base), with the turns so far. Pressing the talk
// keys again ends it.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language } from '../../../shared/languages'
import type { Moment } from '../../../shared/moment'
import { say } from '../components/errors'
import { voiceTurns } from '../explain/thread'
import { useLiveTutor, type LiveTutor } from '../explain/voice/useLiveTutor'

export type StripTalk = {
  /** Talking now: the bubble shows. */
  talking: boolean
  /** What the conversation is in, and the line it is about (none: a free conversation). */
  about?: { moment?: Moment; language: Language }
  live: LiveTutor
  begin: () => void
  end: () => void
  toText: () => void
}

/** Talking from the strip, in `language` (the one being learnt). */
export function useStripTalk(language: Language, onError: (text: string) => void): StripTalk {
  // The conversation under way; none: not talking.
  const [about, setAbout] = useState<StripTalk['about']>()
  const live = useLiveTutor(language)
  const { start: startVoice, end: endVoice, transcripts, status } = live

  const begin = useCallback(() => {
    window.duet.talkHere.start().then(
      (next) => {
        // Together, so no render shows the conversation with the last session's "ended" status.
        setAbout(next)
        void startVoice()
      },
      (cause) => onError(say(cause, 'Duet couldn’t start talking. Try again.'))
    )
  }, [onError, startVoice])

  const end = useCallback(() => {
    endVoice()
    setAbout(undefined)
    void window.duet.talkHere.end()
  }, [endVoice])

  const toText = useCallback(() => {
    const turns = voiceTurns(transcripts.filter((turn) => turn.text.trim()))
    endVoice()
    setAbout(undefined)
    window.duet.talkHere.toText(turns).catch((cause) => onError(say(cause, 'Couldn’t open the conversation in writing.')))
  }, [endVoice, transcripts, onError])

  // Voice that stopped by itself (not with an error to show): the conversation is over.
  const talking = !!about && status !== 'ended'
  useEffect(() => {
    if (about && status === 'ended') void window.duet.talkHere.end()
  }, [about, status])

  // The talk keys start talking, or end it.
  const latest = useRef({ talking, begin, end })
  useEffect(() => {
    latest.current = { talking, begin, end }
  })
  useEffect(() => window.duet.talkHere.onKeys(() => (latest.current.talking ? latest.current.end() : latest.current.begin())), [])

  return { talking, about, live, begin, end, toText }
}
