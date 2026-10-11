// Say the line: Duet says a line from the last video, the learner says it back, and Duet says what
// matched and at most one thing to work on.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LineAttempt, SessionView } from '../../../../shared/daily'
import { say } from '../../components/errors'
import { Icon } from '../../components/Icon'
import { useRecorder } from './useRecorder'

export function SayLine({ line, onNext }: { line: NonNullable<SessionView['say']>; onNext: () => void }): React.JSX.Element {
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
        const clip = await window.duet.daily.speak()
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
      setAttempt(await window.duet.daily.coach({ data: wav, mimeType: 'audio/wav' }))
    } catch (cause) {
      setError(say(cause, 'Duet could not hear that. Try again.'))
    } finally {
      setBusy(undefined)
    }
  }, [])
  const recorder = useRecorder(coach)

  return (
    <section className="card-box daily-step" aria-label="Say the line">
      <span className="label">Say the line</span>
      <p className="big-line">{line.original}</p>
      <p className="muted">{line.translation}</p>
      <audio ref={audio} hidden />
      <div className="row">
        <button type="button" className="btn" disabled={!!busy || recorder.recording} onClick={() => void hear()}>
          <Icon name="volume" size={14} />
          {busy === 'hearing' ? 'Getting the line…' : 'Hear it'}
        </button>
        <button
          type="button"
          className={`btn${recorder.recording ? ' primary' : ''}`}
          disabled={busy === 'coaching' || busy === 'hearing'}
          onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
        >
          <Icon name="mic" size={14} />
          {recorder.recording ? 'Stop' : attempt ? 'Try again' : 'Say it'}
        </button>
      </div>
      <div role="status" className="daily-feedback">
        {busy === 'coaching' && <p className="faint">Listening…</p>}
        {attempt && (
          <>
            {attempt.heard && <p className="faint">Duet heard: {attempt.heard}</p>}
            <p>{attempt.note}</p>
          </>
        )}
      </div>
      {(error || recorder.error) && (
        <p className="notice error" role="alert">
          {error ?? recorder.error}
        </p>
      )}
      <button type="button" className={`btn${attempt ? ' primary' : ' quiet'}`} disabled={recorder.recording} onClick={onNext}>
        {attempt ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
