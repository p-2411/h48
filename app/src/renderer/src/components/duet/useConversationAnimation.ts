import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../../../shared/explain'
import type { LiveTutor } from '../../explain/voice/useLiveTutor'
import { isVoiceOn } from '../../explain/voice/useLiveTutor'
import { voiceMascotState } from '../../explain/voice/status'
import {
  ConversationDirector,
  ListeningActivity,
  VoiceMood,
  type AnimationCue,
  type AnimationTurn
} from './conversation'
import { createMicrophoneMeter } from './listening'
import type { DuetMood } from './engine'

export function useConversationAnimation(input: {
  live: LiveTutor
  chat?: ChatMessage[]
  replying?: boolean
  cheering?: boolean
}): { state: DuetMood; speaking: boolean; cue?: AnimationCue; doze: boolean } {
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  })
  const [cue, setCue] = useState<AnimationCue>()
  useEffect(() => {
    const director = new ConversationDirector()
    const activity = new ListeningActivity()
    // How the learner sounds (laughing, animated, halting, a sudden exclamation): on-device only.
    const voice = new VoiceMood()
    const meter = createMicrophoneMeter()
    let published: AnimationCue | undefined
    let epoch = latest.current.live.animationSession
    let status = latest.current.live.status
    let lastText = -Infinity
    let correction = ''
    let cheered = false
    let alternate = false
    let ignoredTurn = ''
    let timer: ReturnType<typeof setInterval> | undefined
    const getTurn = (): AnimationTurn | undefined => {
      const { live, chat } = latest.current
      if (isVoiceOn(live.status)) return live.transcripts.at(-1)
      const last = chat?.at(-1)
      return last
        ? {
            id: `text-${chat!.length}`,
            role: last.from === 'duet' ? 'tutor' : 'learner',
            text: last.text,
            complete: true
          }
        : undefined
    }
    // Mounting/reconnecting must not replay historical conversation emotions.
    ignoredTurn = getTurn()?.id ?? ''
    correction = ignoredTurn
    cheered = !!latest.current.cheering
    const publish = (): void => {
      if (director.cue !== published) {
        published = director.cue
        setCue(published)
      }
    }
    const offResult = window.duet.tutor.onActionResult((result) => {
      if (document.hidden || !['saved-card', 'reviewed-card'].includes(result.kind)) return
      director.offer({ mood: 'correct', priority: 10 }, performance.now())
      publish()
    })
    const tick = (): void => {
      const { live, chat, cheering } = latest.current
      const now = performance.now()
      if (
        live.animationSession !== epoch ||
        (live.status !== status &&
          ['reconnecting', 'ended', 'ending', 'error'].includes(live.status))
      ) {
        director.reset()
        activity.reset()
        voice.reset()
        meter.dispose()
        ignoredTurn = getTurn()?.id ?? ''
        correction = ignoredTurn
        cheered = !!cheering
        lastText = -Infinity
      }
      epoch = live.animationSession
      // Duet has just finished speaking: from now, a long silence may mean the learner is stuck.
      if (status === 'speaking' && live.status === 'listening') voice.waiting(now)
      status = live.status
      const connected = ['listening', 'speaking', 'working'].includes(status)
      if (connected && !live.muted) {
        const rms = meter.read(live.microphone.current)
        const signal = activity.sample(rms, now)
        const sound = voice.sample(rms, now, status === 'listening')
        if (signal.started) director.interrupt()
        // After the interruption, so a reaction to how the learner starts (a sudden "wow!") stays.
        if (sound) director.offer(sound, now)
        if (signal.backchannel && status === 'listening') {
          alternate = !alternate
          director.offer({ gesture: alternate ? 'mmhm' : 'nod', priority: 1 }, now)
        }
      } else {
        activity.reset()
        voice.reset()
        meter.dispose()
      }
      director.tick(now)
      if (now - lastText >= 150) {
        lastText = now
        const turn = getTurn()
        const last = chat?.at(-1)
        // Strong app evidence wins before text rules are considered in this tick.
        if (cheering && !cheered) director.offer({ mood: 'correct', priority: 10 }, now)
        cheered = !!cheering
        if (!isVoiceOn(status) && last?.correction && turn?.id !== correction) {
          correction = turn?.id ?? ''
          director.offer({ mood: 'almost', tone: 'gentle', priority: 10 }, now)
        }
        if (turn && turn.id !== ignoredTurn) director.read(turn, now)
      }
      publish()
    }
    const visibility = (): void => {
      clearInterval(timer)
      timer = undefined
      if (document.hidden) {
        director.reset()
        activity.reset()
        voice.reset()
        meter.dispose()
        ignoredTurn = getTurn()?.id ?? ''
        publish()
      } else {
        tick()
        timer = setInterval(tick, Math.ceil(1000 / 30))
      }
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      meter.dispose()
      director.reset()
      offResult()
    }
  }, [])
  const { live, replying } = input
  const base = voiceMascotState(live.status) as DuetMood
  return {
    state: cue?.mood ?? (base === 'idle' && replying ? 'thinking' : base),
    speaking: live.status === 'speaking' && !live.tutorMuted && !live.speakerBlocked,
    cue,
    doze: !isVoiceOn(live.status) && !replying && !cue
  }
}
