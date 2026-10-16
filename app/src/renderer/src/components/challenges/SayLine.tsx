// Say the line: Duet says a line from the video, the learner says it back, and Duet says what
// matched and at most one thing to work on.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LineAttempt, SayView } from '../../../../shared/daily'
import { say } from '../errors'
import { Icon } from '../Icon'
import { MicButton } from '../MicButton'
import type { ChallengeApi } from './api'
import './challenges.css'
import { useRecorder } from './useRecorder'

export function SayLine({
  line,
  api,
  onNext
}: {
  line: SayView
  api: ChallengeApi
  onNext: (answered: boolean) => void
}): React.JSX.Element {
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
        url.current = URL.createObjectURL(
          new Blob([new Uint8Array(clip.data)], { type: clip.mimeType })
        )
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

  const coach = useCallback(
    async (wav: Uint8Array) => {
      setBusy('coaching')
      setError(undefined)
      try {
        setAttempt(await api.coach({ data: wav, mimeType: 'audio/wav' }))
      } catch (cause) {
        setError(say(cause, 'Duet could not hear that. Try again.'))
      } finally {
        setBusy(undefined)
      }
    },
    [api]
  )
  const recorder = useRecorder(coach)

  const coaching = busy === 'coaching'
  // After a try, the mic says nothing: what Duet heard is shown below it.
  const micLabel = recorder.recording
    ? 'Listening… tap to stop'
    : coaching
      ? 'Checking…'
      : attempt
        ? undefined
        : 'Tap, then say it'
  return (
    <section className="challenge say-practice" aria-label="Say the line">
      <span className="challenge-label">Say the line</span>
      <p className="challenge-line">{line.original}</p>
      <p className="challenge-hint">{line.translation}</p>
      <audio ref={audio} hidden />
      <MicButton
        recording={recorder.recording}
        checking={coaching}
        level={recorder.level}
        label={micLabel}
        ariaLabel={
          recorder.recording ? 'Stop recording' : attempt ? 'Try saying it again' : 'Say the line'
        }
        disabled={busy === 'hearing'}
        onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
      />
      <button
        type="button"
        className="challenge-btn hear-line"
        disabled={!!busy || recorder.recording}
        onClick={() => void hear()}
      >
        <Icon name="volume" size={14} />
        {busy === 'hearing' ? 'Getting the line…' : 'Hear it'}
      </button>
      <div role="status" className="challenge-feedback">
        {attempt && !coaching && !recorder.recording && (
          <div className={`say-result ${attempt.good ? 'is-good' : 'is-close'}`}>
            <span className="say-result-head">
              <span className="say-face" aria-hidden="true">
                <i />
                <i />
              </span>
              {attempt.good ? 'Sounds right' : 'Nearly there'}
            </span>
            {attempt.heard && <p className="say-heard">“{attempt.heard}”</p>}
            {attempt.note && <p className="say-note">{attempt.note}</p>}
          </div>
        )}
      </div>
      {(error || recorder.error) && (
        <p className="challenge-error" role="alert">
          {error ?? recorder.error}
        </p>
      )}
      <button
        type="button"
        className={`challenge-btn${attempt ? ' primary' : ' quiet'}`}
        disabled={recorder.recording}
        onClick={() => onNext(!!attempt)}
      >
        {attempt ? 'Next' : 'Skip'}
      </button>
    </section>
  )
}
