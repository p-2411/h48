// Browser-side GPT-Live transport. WebRTC carries microphone/model audio while the data channel
// carries transcripts and delegated tool calls. The API key remains in Electron's main process.
import { useCallback, useEffect, useRef, useState } from 'react'
import { languageName, type Language } from '../../../../shared/languages'
import { say } from '../../components/errors'
import { voiceGreeting, type VoiceTopic } from './prompts'
import { LIVE_REPLY_FALLBACK_MS } from './timing'
import { nextReconnectAttempt, RECONNECT_LIMIT } from './reconnect'

export type TutorLiveStatus =
  | 'idle'
  | 'requesting-microphone'
  | 'connecting'
  | 'reconnecting'
  | 'listening'
  | 'speaking'
  | 'working'
  | 'ending'
  | 'ended'
  | 'error'

/** Voice is on: the panel shows the voice bar in place of the message box. */
export type VoiceOnStatus = Exclude<TutorLiveStatus, 'idle' | 'ended' | 'error'>

export function isVoiceOn(status: TutorLiveStatus): status is VoiceOnStatus {
  return status !== 'idle' && status !== 'ended' && status !== 'error'
}

/** The session is up, so its controls (mute, check pronunciation) work. */
export function isConnected(status: TutorLiveStatus): boolean {
  return status === 'listening' || status === 'speaking' || status === 'working'
}

export type LiveTutor = ReturnType<typeof useLiveTutor>

export type TranscriptSegment = {
  id: string
  role: 'learner' | 'tutor'
  text: string
  startMs: number
  endMs: number
}

type LiveEvent = {
  type?: string
  delta?: string
  start_ms?: number
  end_ms?: number
  error?: { message?: string }
  usage?: { seconds?: number }
  event?: {
    type?: string
    item?: { type?: string; call_id?: string; name?: string; arguments?: string }
  }
}

const PLAYBACK_BLOCKED =
  'Duet is speaking, but your system blocked playback. Press Hear Duet to retry.'

const MICROPHONE_DENIED =
  'Duet can’t use the microphone. Allow it in your system settings, then try voice again.'

/** The browser refused the microphone: only the learner can change that, in system settings. */
function microphoneDenied(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
}

function waitForIce(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 3_000)
    const change = (): void => {
      if (connection.iceGatheringState !== 'complete') return
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', change)
      resolve()
    }
    connection.addEventListener('icegatheringstatechange', change)
  })
}

/** Voice with Duet in `language` (none yet: voice can't start), about `topic` (a line, or nothing in
 * particular). The tutor's context itself is in the main process. */
export function useLiveTutor(language?: Language, topic: VoiceTopic = 'line'): {
  status: TutorLiveStatus
  transcripts: TranscriptSegment[]
  error?: string
  /** The last start failed because the microphone was refused. */
  microphoneBlocked: boolean
  muted: boolean
  tutorMuted: boolean
  speakerBlocked: boolean
  usageSeconds: number
  start: (preserveConversation?: boolean) => Promise<void>
  end: () => void
  toggleMicrophone: () => void
  toggleTutorAudio: () => void
  retryTutorAudio: () => void
  requestPronunciationCheck: () => void
  offerEnglishHelp: () => void
} {
  // The language being learnt, by name, for the instructions sent during the session. A session
  // can't start without one, so the neutral fallback is never sent.
  const name = language ? languageName(language) : 'the language'
  const nameRef = useRef(name)
  const topicRef = useRef(topic)
  useEffect(() => {
    nameRef.current = name
    topicRef.current = topic
  }, [name, topic])
  const [status, setStatus] = useState<TutorLiveStatus>('idle')
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<string>()
  const [microphoneBlocked, setMicrophoneBlocked] = useState(false)
  const [muted, setMuted] = useState(false)
  const [tutorMuted, setTutorMuted] = useState(false)
  const [speakerBlocked, setSpeakerBlocked] = useState(false)
  const [usageSeconds, setUsageSeconds] = useState(0)
  const connection = useRef<RTCPeerConnection | null>(null)
  const channel = useRef<RTCDataChannel | null>(null)
  const microphone = useRef<MediaStream | null>(null)
  const speaker = useRef<HTMLAudioElement | null>(null)
  const handledCalls = useRef(new Set<string>())
  const closeTimer = useRef<number | undefined>(undefined)
  const replyFallbackTimer = useRef<number | undefined>(undefined)
  const outputSettledTimer = useRef<number | undefined>(undefined)
  const reconnectTimer = useRef<number | undefined>(undefined)
  const disconnectTimer = useRef<number | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  // When the current session said it started, so a long healthy session earns fresh reconnects.
  const healthySince = useRef<number | undefined>(undefined)
  // Bumped on every release, so a start() still awaiting the microphone or network knows to stop.
  const generation = useRef(0)
  const manuallyEnded = useRef(false)
  // A connect() is under way (from the microphone to the session's answer).
  const starting = useRef(false)
  const startRef = useRef<(preserveConversation?: boolean) => Promise<void>>(async () => undefined)

  const release = useCallback((next: TutorLiveStatus = 'ended') => {
    generation.current += 1
    healthySince.current = undefined
    window.clearTimeout(closeTimer.current)
    window.clearTimeout(replyFallbackTimer.current)
    window.clearTimeout(outputSettledTimer.current)
    window.clearTimeout(disconnectTimer.current)
    closeTimer.current = undefined
    replyFallbackTimer.current = undefined
    outputSettledTimer.current = undefined
    disconnectTimer.current = undefined
    microphone.current?.getTracks().forEach((track) => track.stop())
    microphone.current = null
    // Clear each ref before closing it, so its close events know this was on purpose and don't
    // start a reconnect that would hide the real error.
    const events = channel.current
    channel.current = null
    events?.close()
    const peer = connection.current
    connection.current = null
    peer?.close()
    if (speaker.current) speaker.current.srcObject = null
    speaker.current = null
    setMuted(false)
    setStatus(next)
  }, [])

  const reconnect = useCallback((): void => {
    if (manuallyEnded.current || reconnectTimer.current !== undefined) return
    const attempt = nextReconnectAttempt(
      reconnectAttempts.current,
      healthySince.current,
      Date.now()
    )
    reconnectAttempts.current = attempt
    if (attempt > RECONNECT_LIMIT) {
      setError('Duet could not restore the voice connection. Try voice again when you’re ready.')
      release('error')
      return
    }
    // Mark recovery as scheduled before closing the old channel, whose close event can fire at once.
    reconnectTimer.current = -1
    release('reconnecting')
    // "/3" is RECONNECT_LIMIT; smoke-tutor.mjs looks for this exact text.
    setError(`Voice connection interrupted. Reconnecting (${attempt}/3)…`)
    reconnectTimer.current = window.setTimeout(
      () => {
        reconnectTimer.current = undefined
        void startRef.current(true)
      },
      Math.min(2_500, 500 * attempt)
    )
  }, [release])

  useEffect(
    () => () => {
      manuallyEnded.current = true
      window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = undefined
      release('ended')
    },
    [release]
  )

  const appendTranscript = useCallback(
    (role: TranscriptSegment['role'], delta: string, startMs: number, endMs: number): void => {
      if (!delta) return
      setTranscripts((current) => {
        const last = current.at(-1)
        if (last && last.role === role && startMs - last.endMs < 1_000) {
          return [...current.slice(0, -1), { ...last, text: last.text + delta, endMs }]
        }
        // Unique across sessions, so a new conversation's turn never inherits an old turn's
        // revealed meaning or pronunciation.
        return [
          ...current,
          { id: `${role}-${crypto.randomUUID()}`, role, text: delta, startMs, endMs }
        ]
      })
    },
    []
  )

  const send = useCallback((event: Record<string, unknown>): void => {
    if (channel.current?.readyState === 'open') channel.current.send(JSON.stringify(event))
  }, [])

  const playSpeaker = useCallback((): void => {
    const audio = speaker.current
    if (!audio) return
    void audio
      .play()
      .then(() => {
        setSpeakerBlocked(false)
        setError((current) => (current === PLAYBACK_BLOCKED ? undefined : current))
      })
      .catch(() => {
        setSpeakerBlocked(true)
        setError(PLAYBACK_BLOCKED)
      })
  }, [])

  const handleToolCall = useCallback(
    async (item: NonNullable<LiveEvent['event']>['item']): Promise<void> => {
      if (!item?.call_id || !item.name || handledCalls.current.has(item.call_id)) return
      handledCalls.current.add(item.call_id)
      const events = channel.current
      setStatus('working')
      let args: unknown = {}
      try {
        args = item.arguments ? JSON.parse(item.arguments) : {}
      } catch {
        args = { invalidJson: true }
      }
      let output: string
      try {
        const result = await window.duet.tutor.executeTool({
          callId: item.call_id,
          name: item.name,
          arguments: args
        })
        output = result.output
      } catch {
        output = JSON.stringify({ error: 'APP_TOOL_UNAVAILABLE' })
      }
      // The session ended or reconnected while the app worked, so this answer has nowhere to go.
      if (channel.current !== events) return
      send({
        type: 'response.item.create',
        event_id: `tool-${crypto.randomUUID()}`,
        item: { type: 'function_call_output', call_id: item.call_id, output }
      })
      send({ type: 'response.create', event_id: `continue-${crypto.randomUUID()}` })
      setStatus('listening')
    },
    [send]
  )

  const handleEvent = useCallback(
    (event: LiveEvent): void => {
      switch (event.type) {
        case 'session.started': {
          healthySince.current = Date.now()
          setError(undefined)
          setStatus('listening')
          const greeting = voiceGreeting(topicRef.current)
          send({
            type: 'session.instructions.append',
            event_id: `greeting-${crypto.randomUUID()}`,
            delegation_id: null,
            content: greeting.instructions
          })
          send({
            type: 'session.commentary.append',
            event_id: `welcome-${crypto.randomUUID()}`,
            delegation_id: null,
            content: greeting.commentary
          })
          break
        }
        case 'session.input_transcript.delta':
          window.clearTimeout(outputSettledTimer.current)
          setStatus('listening')
          appendTranscript('learner', event.delta ?? '', event.start_ms ?? 0, event.end_ms ?? 0)
          // Tell main the learner just spoke (and what), so the voice model can't confirm a save, or
          // record a word used, without them.
          if (event.delta) window.duet.tutor.learnerTurn(event.delta)
          window.clearTimeout(replyFallbackTimer.current)
          replyFallbackTimer.current = window.setTimeout(() => {
            setStatus('working')
            send({
              type: 'session.commentary.append',
              event_id: `reply-fallback-${crypto.randomUUID()}`,
              delegation_id: null,
              content:
                `Respond aloud now to the learner's latest completed turn. Begin with a brief, warm acknowledgement that fits what they said. Then answer or continue the practice. If they attempted ${nameRef.current} and made a meaningful error, give one actionable correction in English first, model the natural ${nameRef.current} once, and invite a retry. If their meaning was unclear, say so in English and ask them to repeat. Never leave the turn unanswered.`
            })
            replyFallbackTimer.current = undefined
          }, LIVE_REPLY_FALLBACK_MS)
          break
        case 'session.output_transcript.delta':
          window.clearTimeout(replyFallbackTimer.current)
          window.clearTimeout(outputSettledTimer.current)
          replyFallbackTimer.current = undefined
          setStatus('speaking')
          appendTranscript('tutor', event.delta ?? '', event.start_ms ?? 0, event.end_ms ?? 0)
          outputSettledTimer.current = window.setTimeout(() => {
            setStatus('listening')
            outputSettledTimer.current = undefined
          }, 1_500)
          break
        case 'session.output_audio.done':
          window.clearTimeout(outputSettledTimer.current)
          outputSettledTimer.current = undefined
          setStatus('listening')
          break
        case 'session.input_audio.muted':
          setMuted(true)
          break
        case 'session.input_audio.unmuted':
          setMuted(false)
          break
        case 'session.usage.updated':
          setUsageSeconds(event.usage?.seconds ?? 0)
          break
        case 'response.event':
          if (
            event.event?.type === 'response.output_item.done' &&
            event.event.item?.type === 'function_call'
          )
            void handleToolCall(event.event.item)
          break
        case 'session.closed':
          if (manuallyEnded.current) release('ended')
          else reconnect()
          break
        case 'error':
          setError(say(event.error?.message, 'Voice stopped because of an error. Try voice again.'))
          release('error')
          break
      }
    },
    [appendTranscript, handleToolCall, reconnect, release, send]
  )

  const connect = useCallback(
    async (preserveConversation = false): Promise<void> => {
      if (
        !language ||
        // A start still under way: a second press (before the status above has changed) would open a
        // second microphone and session and lose the first.
        starting.current ||
        status === 'connecting' ||
        status === 'requesting-microphone' ||
        (status === 'reconnecting' && !preserveConversation)
      )
        return
      starting.current = true
      manuallyEnded.current = false
      setError(undefined)
      setMicrophoneBlocked(false)
      if (!preserveConversation) {
        setTranscripts([])
        setUsageSeconds(0)
      }
      handledCalls.current.clear()
      // End, leaving the line or a reconnect releases the session while this attempt may still be
      // waiting. After each wait, an outdated attempt stops its own microphone and connection.
      const run = generation.current
      const stale = (): boolean => generation.current !== run
      let stream: MediaStream | undefined
      let peer: RTCPeerConnection | undefined
      const abandon = (): void => {
        stream?.getTracks().forEach((track) => track.stop())
        peer?.close()
      }
      try {
        setStatus('requesting-microphone')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        if (stale()) return abandon()
        microphone.current = stream
        setStatus('connecting')
        peer = new RTCPeerConnection()
        connection.current = peer
        const current = peer
        const audio = new Audio()
        audio.autoplay = true
        audio.muted = tutorMuted
        audio.volume = 1
        audio.setAttribute('playsinline', '')
        speaker.current = audio
        current.addEventListener('track', ({ streams, track }) => {
          audio.srcObject = streams[0] ?? new MediaStream([track])
          playSpeaker()
          track.addEventListener('unmute', playSpeaker)
        })
        current.addEventListener('connectionstatechange', () => {
          // A released connection's state changes are expected; only the live one may reconnect.
          if (connection.current !== current) return
          if (current.connectionState === 'connected') {
            window.clearTimeout(disconnectTimer.current)
            disconnectTimer.current = undefined
          } else if (current.connectionState === 'failed') {
            reconnect()
          } else if (current.connectionState === 'disconnected') {
            window.clearTimeout(disconnectTimer.current)
            disconnectTimer.current = window.setTimeout(reconnect, 1_200)
          }
        })
        for (const track of stream.getAudioTracks()) current.addTrack(track, stream)
        const events = current.createDataChannel('oai-events')
        channel.current = events
        events.addEventListener('close', () => {
          if (channel.current === events && !manuallyEnded.current) reconnect()
        })
        events.addEventListener('message', ({ data }) => {
          if (channel.current !== events) return
          try {
            handleEvent(JSON.parse(String(data)) as LiveEvent)
          } catch {
            setError('Voice stopped: Duet sent something the app could not read.')
            release('error')
          }
        })
        const offer = await current.createOffer()
        if (stale()) return abandon()
        await current.setLocalDescription(offer)
        if (stale()) return abandon()
        await waitForIce(current)
        if (stale()) return abandon()
        const sdp = current.localDescription?.sdp
        if (!sdp) throw new Error('Could not prepare the microphone connection.')
        const answer = await window.duet.tutor.startSession({ sdp })
        if (stale()) return abandon()
        await current.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
        if (stale()) return abandon()
      } catch (cause) {
        // A released attempt fails as its connection closes; that isn't the learner's problem.
        if (stale()) return abandon()
        setMicrophoneBlocked(microphoneDenied(cause))
        setError(microphoneDenied(cause) ? MICROPHONE_DENIED : say(cause, 'Voice could not start.'))
        release('error')
      } finally {
        starting.current = false
      }
    },
    [handleEvent, language, playSpeaker, reconnect, release, status, tutorMuted]
  )

  useEffect(() => {
    startRef.current = connect
  }, [connect])

  // Starts from the learner (the mic button) get a fresh set of automatic reconnects; the
  // automatic ones go straight to connect() so the limit holds.
  const start = useCallback(
    (preserveConversation = false): Promise<void> => {
      reconnectAttempts.current = 0
      return connect(preserveConversation)
    },
    [connect]
  )

  const end = useCallback((): void => {
    manuallyEnded.current = true
    window.clearTimeout(reconnectTimer.current)
    reconnectTimer.current = undefined
    if (!channel.current || channel.current.readyState !== 'open') return release('ended')
    setStatus('ending')
    send({ type: 'session.close', event_id: `close-${crypto.randomUUID()}` })
    closeTimer.current = window.setTimeout(() => release('ended'), 3_000)
  }, [release, send])

  const toggleMicrophone = useCallback((): void => {
    const next = !muted
    microphone.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    send({
      type: next ? 'session.input_audio.mute' : 'session.input_audio.unmute',
      event_id: `microphone-${crypto.randomUUID()}`
    })
  }, [muted, send])

  const toggleTutorAudio = useCallback((): void => {
    // Touch the audio element here, not in the state updater: React may run updaters twice.
    const next = !tutorMuted
    if (speaker.current) {
      speaker.current.muted = next
      if (!next) playSpeaker()
    }
    setTutorMuted(next)
  }, [playSpeaker, tutorMuted])

  const retryTutorAudio = useCallback((): void => {
    if (speaker.current) speaker.current.muted = false
    setTutorMuted(false)
    playSpeaker()
  }, [playSpeaker])

  const requestPronunciationCheck = useCallback((): void => {
    send({
      type: 'session.instructions.append',
      event_id: `pronunciation-${crypto.randomUUID()}`,
      delegation_id: null,
      content:
        `The learner requested a focused pronunciation check. Ask them to say the current ${nameRef.current} phrase. Listen to the live audio, then respond in English with one narrow, actionable observation about intelligibility, timing or clarity. If the audio is unsuitable, say so. Do not score their accent. Model the target naturally once and offer one retry.`
    })
    send({
      type: 'session.commentary.append',
      event_id: `pronunciation-prompt-${crypto.randomUUID()}`,
      delegation_id: null,
      content:
        `Ask the learner to say the current ${nameRef.current} phrase once for the pronunciation check, then listen.`
    })
  }, [send])

  const offerEnglishHelp = useCallback((): void => {
    send({
      type: 'session.instructions.append',
      event_id: `english-help-${crypto.randomUUID()}`,
      delegation_id: null,
      content:
        `The learner has paused after your ${nameRef.current} reply and has not revealed its English meaning. In one brief English sentence, ask whether they want the meaning, a slower repetition, or a small hint. Do not imply that pausing was a failure. Then listen.`
    })
  }, [send])

  return {
    status,
    transcripts,
    error,
    microphoneBlocked,
    muted,
    tutorMuted,
    speakerBlocked,
    usageSeconds,
    start,
    end,
    toggleMicrophone,
    toggleTutorAudio,
    retryTutorAudio,
    requestPronunciationCheck,
    offerEnglishHelp
  }
}
