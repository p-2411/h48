// Read the existing WebRTC microphone. Never connect it to an output or stop its tracks.
export function createMicrophoneMeter(): {
  read(stream: MediaStream | null): number
  dispose(): void
} {
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let analyser: AnalyserNode | undefined
  let current: MediaStream | null = null
  let failed: MediaStream | null = null
  const samples = new Float32Array(256)
  const dispose = (): void => {
    source?.disconnect()
    analyser?.disconnect()
    if (context) void context.close().catch(() => {})
    context = undefined
    source = undefined
    analyser = undefined
    current = null
  }
  return {
    dispose,
    read(stream) {
      if (stream && stream === failed) return 0
      if (
        !stream ||
        !stream.getAudioTracks().some((track) => track.enabled && track.readyState === 'live')
      ) {
        if (context) dispose()
        return 0
      }
      try {
        if (stream !== current) {
          dispose()
          current = stream
          context = new AudioContext()
          analyser = context.createAnalyser()
          analyser.fftSize = samples.length
          source = context.createMediaStreamSource(stream)
          source.connect(analyser)
        }
        if (context?.state === 'suspended') void context.resume().catch(() => {})
        if (!analyser || context?.state !== 'running') return 0
        analyser.getFloatTimeDomainData(samples)
        let energy = 0
        for (const value of samples) energy += value * value
        return Math.sqrt(energy / samples.length)
      } catch {
        // A failed optional meter never affects the microphone or conversation.
        dispose()
        failed = stream
        return 0
      }
    }
  }
}
