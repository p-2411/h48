// Say the line: Duet says a line from the last video, the learner says it back, and Duet says what
// matched and at most one thing to work on.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LineAttempt, SessionView } from '../../../../shared/daily'
import { say } from '../errors'
import { Icon } from '../Icon'
import type { ChallengeApi } from './api'
import './challenges.css'
import { useRecorder } from './useRecorder'

export function SayLine({ line, api, onNext }: { line: NonNullable<SessionView['say']>; api: ChallengeApi; onNext: (answered: boolean) => void }): React.JSX.Element {
  const [attempt, setAttempt] = useState<LineAttempt>()
  const [busy, setBusy] = useState<'hearing' | 'coaching'>()
  const [error, setError] = useState<string>()
  const audio = useRef<HTMLAudioElement>(null)
  const url = useRef<string>(undefined)
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current)
    },
    []
  )

  const hear = async (): Promise<void> => {
    setError(undefined)
    try {
      if (!url.current) {
        setBusy('hearing')
        const clip = await api.speak()
        url.current = URL.createObjectURL(new Blob([new Uint8Array(clip.data)], { type: clip.mimeType }))
      }
      if (audio.current) {
        audio.current.src = url.current
        await audio.current.play()
      }
    } catch (cause) {
      setError(say(cause, 'Duet could not say the line.'))
    } finally {
      setBusy(undefined)
    }
  }

  const coach = useCallback(async (wav: Uint8Array) => {
    setBusy('coaching')
    setError(undefined)
    try {
      setAttempt(await api.coach({ data: wav, mimeType: 'audio/wav' }))
    } catch (cause) {
      setError(say(cause, 'Duet could not hear that. Try again.'))
    } finally {
      setBusy(undefined)
    }
  }, [api])
  const recorder = useRecorder(coach)

  return (
    <section className="challenge" aria-label="Say the line">
      <span className="challenge-label">Say the line</span>
      <p className="challenge-line">{line.original}</p>
      <p className="challenge-hint">{line.translation}</p>
      <audio ref={audio} hidden />
      <div className="challenge-row">
        <button type="button" className="challenge-btn" disabled={!!busy || recorder.recording} onClick={() => void hear()}>
          <Icon name="volume" size={14} />
          {busy === 'hearing' ? 'Getting the line…' : 'Hear it'}
        </button>
        <button
          type="button"
          className={`challenge-btn${recorder.recording ? ' primary' : ''}`}
          disabled={busy === 'coaching' || busy === 'hearing'}
          onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
        >
          <Icon name="mic" size={14} />
          {recorder.recording ? 'Stop' : attempt ? 'Try again' : 'Say it'}
        </button>
      </div>
      <div role="status" className="challenge-feedback">
        {busy === 'coaching' && <p className="challenge-faint">Listening…</p>}
        {attempt && (
          <>
            {attempt.heard && <p className="challenge-faint">Duet heard: {attempt.heard}</p>}
            <p>{attempt.note}</p>
          </>
        )}
      </div>
      {(error || recorder.error) && (
        <p className="challenge-error" role="alert">
          {error ?? recorder.error}
        </p>
      )}
      <button type="button" className={`challenge-btn${attempt ? ' primary' : ' quiet'}`} disabled={recorder.recording} onClick={() => onNext(!!attempt)}>
        {attempt ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
