// Read a small audio envelope beside existing playback. Never route or delay the audible stream.
import { useEffect, useRef, type RefObject } from 'react'
import { reducedMotion } from './motion'

export function useSpeechMouth(
  mascot: RefObject<HTMLDivElement | null>,
  speaking: boolean,
  playback?: RefObject<HTMLAudioElement | null>
): void {
  const requested = useRef(speaking)
  const wake = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    requested.current = speaking
    wake.current?.()
  }, [speaking])

  useEffect(() => {
    const root = mascot.current
    const mouth = root?.querySelector<HTMLElement>('.mouth-core')
    if (!playback || !root || !mouth || reducedMotion()) return
    let context: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let analyser: AnalyserNode | undefined
    let stream: MediaStream | undefined
    let frame = 0
    let lastSample = -Infinity
    let lastFrame = 0
    let level = 0
    let velocity = 0
    let target = 0
    let lastPaint = -1
    let measured = false
    let failed = false
    const samples = new Float32Array(256)

    const releaseAudio = (): void => {
      source?.disconnect()
      analyser?.disconnect()
      if (context && context.state !== 'closed') void context.close().catch(() => {})
      context = undefined
      analyser = undefined
      source = undefined
      stream = undefined
    }
    const detach = (): void => {
      releaseAudio()
      root.removeAttribute('data-audio-mouth')
      mouth.style.removeProperty('height')
      mouth.style.removeProperty('border-radius')
      lastPaint = -1
    }

    const tick = (now: number): void => {
      frame = 0
      if (failed) return
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 1 / 60
      lastFrame = now
      try {
        if (now - lastSample >= 1000 / 30) {
          lastSample = now
          const audio = playback.current
          const next = audio?.srcObject
          if (next instanceof MediaStream && next !== stream) {
            // Keep the current pose through reconnects instead of resetting to a closed mouth.
            releaseAudio()
            stream = next
            context = new AudioContext()
            analyser = context.createAnalyser()
            analyser.fftSize = samples.length
            source = context.createMediaStreamSource(next)
            source.connect(analyser)
            // The original audio element remains the only speaker.
            const currentContext = context
            void currentContext.resume().catch(() => {
              if (context !== currentContext) return
              failed = true
              cancelAnimationFrame(frame)
              detach()
            })
          }
          let energy = 0
          if (analyser && context?.state === 'running') {
            measured = true
            if (next === stream && audio && !audio.paused && !audio.muted && audio.volume > 0) {
              analyser.getFloatTimeDomainData(samples)
              for (const sample of samples) energy += sample * sample
            }
          }
          const rms = Math.sqrt(energy / samples.length)
          target = Math.pow(Math.min(1, Math.max(0, (rms - 0.008) * 6)), 0.75)
        }
        // A critically damped spring keeps velocity continuous when syllables change.
        // Audio is sampled at <=30 Hz; only this tiny local mouth pose follows display frames.
        const omega = 32
        const offset = level - target
        const impulse = velocity + omega * offset
        const decay = Math.exp(-omega * dt)
        level = target + (offset + impulse * dt) * decay
        velocity = (velocity - omega * impulse * dt) * decay
        if (measured && Math.abs(level - lastPaint) >= 0.002) {
          lastPaint = level
          root.dataset.audioMouth = 'true'
          mouth.style.height = `${10 + level * 13}px`
          // A rounder small smile opens into a slightly fuller lower jaw on stressed vowels.
          // The straight upper edge, width and stroke thickness never change.
          mouth.style.borderRadius = `0 0 ${50 - level * 12}% ${50 - level * 12}% / 0 0 ${100 - level * 24}% ${100 - level * 24}%`
        }
        // Transcript/status events can precede the end of audible playback. Let actual audio
        // finish, then settle without removing the pose or restarting the CSS speaking loop.
        if (requested.current || target > 0.001 || level > 0.002 || Math.abs(velocity) > 0.01) {
          frame = requestAnimationFrame(tick)
        } else {
          releaseAudio()
          lastFrame = 0
        }
      } catch {
        // Audio analysis is optional; the normal speaking animation remains the fallback.
        failed = true
        cancelAnimationFrame(frame)
        detach()
      }
    }
    const start = (): void => {
      if (!failed && !frame && requested.current) frame = requestAnimationFrame(tick)
    }
    wake.current = start
    start()
    return () => {
      failed = true
      cancelAnimationFrame(frame)
      wake.current = undefined
      detach()
    }
  }, [mascot, playback])
}
