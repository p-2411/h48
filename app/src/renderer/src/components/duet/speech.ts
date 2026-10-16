// How loud Duet's voice is right now, for the mouth: a small audio envelope read beside the playback
// (the same tap as useSpeechMouth), never routing or delaying the audible stream.

export interface SpeechLevel {
  /** The current loudness, 0–1, or null while there is nothing to measure (no voice playing yet). */
  read(): number | null
  dispose(): void
}

export function createSpeechLevel(
  playback: () => HTMLAudioElement | null | undefined
): SpeechLevel {
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let analyser: AnalyserNode | undefined
  let stream: MediaStream | undefined
  let failed = false
  let measured = false
  let lastSample = -Infinity
  let target = 0
  const samples = new Float32Array(256)

  const release = (): void => {
    source?.disconnect()
    analyser?.disconnect()
    if (context && context.state !== 'closed') void context.close().catch(() => {})
    context = undefined
    analyser = undefined
    source = undefined
    stream = undefined
  }

  return {
    read(): number | null {
      if (failed) return null
      const now = performance.now()
      // Audio is sampled at up to 30 Hz; the engine's springs smooth it between samples.
      if (now - lastSample < 1000 / 30) return measured ? target : null
      lastSample = now
      try {
        const audio = playback()
        const next = audio?.srcObject
        if (next === stream && context?.state === 'suspended') void context.resume().catch(() => {})
        if (next instanceof MediaStream && next !== stream) {
          release()
          stream = next
          context = new AudioContext()
          analyser = context.createAnalyser()
          analyser.fftSize = samples.length
          source = context.createMediaStreamSource(next)
          source.connect(analyser)
          void context.resume().catch(() => {})
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
        return measured ? target : null
      } catch (cause) {
        // Optional: without it the mouth falls back to its own speaking rhythm.
        console.warn("[duet] the mouth could not follow Duet's voice", cause)
        failed = true
        release()
        return null
      }
    },
    dispose: release
  }
}
