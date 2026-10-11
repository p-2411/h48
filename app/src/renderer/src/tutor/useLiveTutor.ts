// Browser-side GPT-Live transport. WebRTC carries microphone/model audio while the data channel
// carries transcripts and delegated tool calls. The API key remains in Electron's main process.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Moment } from '../../../shared/moment'
import { languageName } from '../../../shared/languages'
import { LIVE_REPLY_FALLBACK_MS } from './language'

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

function message(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError')
    return 'Microphone access was denied. Allow it in system settings, then try again.'
  return error instanceof Error ? error.message : 'The voice tutor could not start.'
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

export function useLiveTutor(moment?: Moment): {
  status: TutorLiveStatus
  transcripts: TranscriptSegment[]
  error?: string
  muted: boolean
  tutorMuted: boolean
  speakerBlocked: boolean
  usageSeconds: number
  start: () => Promise<void>
  end: () => void
  toggleMicrophone: () => void
  toggleTutorAudio: () => void
  retryTutorAudio: () => void
  requestPronunciationCheck: () => void
  offerEnglishHelp: () => void
  enableExplore: () => void
} {
  // The language being learnt, by name, for the instructions sent during the session.
  const name = languageName(moment?.language ?? 'ja')
  const nameRef = useRef(name)
  useEffect(() => {
    nameRef.current = name
  }, [name])
  const [status, setStatus] = useState<TutorLiveStatus>('idle')
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([])
  const [error, setError] = useState<string>()
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
  const activeMoment = useRef<number | undefined>(undefined)
  const reconnectAttempts = useRef(0)
  const manuallyEnded = useRef(false)
  const startRef = useRef<(preserveConversation?: boolean) => Promise<void>>(async () => undefined)

  const release = useCallback((next: TutorLiveStatus = 'ended') => {
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
    channel.current?.close()
    channel.current = null
    connection.current?.close()
    connection.current = null
    if (speaker.current) speaker.current.srcObject = null
    speaker.current = null
    setMuted(false)
    setStatus(next)
  }, [])

  const reconnect = useCallback((): void => {
    if (manuallyEnded.current || reconnectTimer.current !== undefined) return
    const attempt = reconnectAttempts.current + 1
    reconnectAttempts.current = attempt
    if (attempt > 3) {
      setError('Duet could not restore the voice connection. Press Reconnect to try again.')
      release('error')
      return
    }
    // Mark recovery as scheduled before closing the old channel, whose close event can fire at once.
    reconnectTimer.current = -1
    release('reconnecting')
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

  useEffect(() => {
    const next = moment?.takenAt
    if (activeMoment.current !== undefined && activeMoment.current !== next) {
      manuallyEnded.current = true
      window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = undefined
      release('ended')
    }
    activeMoment.current = next
  }, [moment?.takenAt, release])

  const appendTranscript = useCallback(
    (role: TranscriptSegment['role'], delta: string, startMs: number, endMs: number): void => {
      if (!delta) return
      setTranscripts((current) => {
        const last = current.at(-1)
        if (last && last.role === role && startMs - last.endMs < 1_000) {
          return [...current.slice(0, -1), { ...last, text: last.text + delta, endMs }]
        }
        return [
          ...current,
          { id: `${role}-${startMs}-${current.length}`, role, text: delta, startMs, endMs }
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
        setError((current) =>
          current?.startsWith('Duet is speaking, but Windows blocked playback')
            ? undefined
            : current
        )
      })
      .catch(() => {
        setSpeakerBlocked(true)
        setError('Duet is speaking, but Windows blocked playback. Press Hear Duet to retry.')
      })
  }, [])

  const handleToolCall = useCallback(
    async (item: NonNullable<LiveEvent['event']>['item']): Promise<void> => {
      if (!item?.call_id || !item.name || handledCalls.current.has(item.call_id)) return
      handledCalls.current.add(item.call_id)
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
        case 'session.started':
          reconnectAttempts.current = 0
          setError(undefined)
          setStatus('listening')
          send({
            type: 'session.instructions.append',
            event_id: `greeting-${crypto.randomUUID()}`,
            delegation_id: null,
            content:
              `Greet the learner briefly in English as Duet. Refer naturally to the current ${nameRef.current} phrase and ask whether they want to understand it or practise saying it. Do not search saved history unless Explore further has been enabled. Then pause and listen.`
          })
          send({
            type: 'session.commentary.append',
            event_id: `welcome-${crypto.randomUUID()}`,
            delegation_id: null,
            content:
              `Welcome the learner briefly as Duet and offer to understand or practise the current ${nameRef.current} phrase.`
          })
          break
        case 'session.input_transcript.delta':
          window.clearTimeout(outputSettledTimer.current)
          setStatus('listening')
          appendTranscript('learner', event.delta ?? '', event.start_ms ?? 0, event.end_ms ?? 0)
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
          setError(event.error?.message || 'The voice session reported an error.')
          release('error')
          break
      }
    },
    [appendTranscript, handleToolCall, reconnect, release, send]
  )

  const start = useCallback(
    async (preserveConversation = false): Promise<void> => {
      if (
        !moment ||
        status === 'connecting' ||
        status === 'requesting-microphone' ||
        (status === 'reconnecting' && !preserveConversation)
      )
        return
      manuallyEnded.current = false
      setError(undefined)
      if (!preserveConversation) {
        setTranscripts([])
        setUsageSeconds(0)
        reconnectAttempts.current = 0
      }
      handledCalls.current.clear()
      try {
        setStatus('requesting-microphone')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        microphone.current = stream
        setStatus('connecting')
        const peer = new RTCPeerConnection()
        connection.current = peer
        const audio = new Audio()
        audio.autoplay = true
        audio.muted = tutorMuted
        audio.volume = 1
        audio.setAttribute('playsinline', '')
        speaker.current = audio
        peer.addEventListener('track', ({ streams, track }) => {
          audio.srcObject = streams[0] ?? new MediaStream([track])
          playSpeaker()
          track.addEventListener('unmute', playSpeaker)
        })
        peer.addEventListener('connectionstatechange', () => {
          if (peer.connectionState === 'connected') {
            window.clearTimeout(disconnectTimer.current)
            disconnectTimer.current = undefined
            reconnectAttempts.current = 0
          } else if (peer.connectionState === 'failed') {
            reconnect()
          } else if (peer.connectionState === 'disconnected') {
            window.clearTimeout(disconnectTimer.current)
            disconnectTimer.current = window.setTimeout(reconnect, 1_200)
          }
        })
        for (const track of stream.getAudioTracks()) peer.addTrack(track, stream)
        const events = peer.createDataChannel('oai-events')
        channel.current = events
        events.addEventListener('close', () => {
          if (!manuallyEnded.current) reconnect()
        })
        events.addEventListener('message', ({ data }) => {
          try {
            handleEvent(JSON.parse(String(data)) as LiveEvent)
          } catch {
            setError('The voice tutor sent an unreadable event.')
            release('error')
          }
        })
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await waitForIce(peer)
        const sdp = peer.localDescription?.sdp
        if (!sdp) throw new Error('Could not prepare the microphone connection.')
        const answer = await window.duet.tutor.startSession({ sdp })
        await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
      } catch (cause) {
        setError(message(cause))
        release('error')
      }
    },
    [handleEvent, moment, playSpeaker, reconnect, release, status, tutorMuted]
  )

  useEffect(() => {
    startRef.current = start
  }, [start])

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
    setTutorMuted((current) => {
      if (speaker.current) {
        speaker.current.muted = !current
        if (current) playSpeaker()
      }
      return !current
    })
  }, [playSpeaker])

  const retryTutorAudio = useCallback((): void => {
    if (speaker.current) speaker.current.muted = false
    setTutorMuted(false)
    playSpeaker()
  }, [playSpeaker])

  const enableExplore = useCallback((): void => {
    send({
      type: 'session.instructions.append',
      event_id: `explore-${crypto.randomUUID()}`,
      delegation_id: null,
      content:
        'The learner explicitly enabled Explore further. You may now search saved cards and earlier encounters when relevant. First ask them to blurt what they remember; only then search and open the best matching card with its stored nuance. Do not dump unrelated history.'
    })
  }, [send])

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
    offerEnglishHelp,
    enableExplore
  }
}
