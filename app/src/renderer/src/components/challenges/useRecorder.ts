// Records the microphone while the learner says a line back, as 16 kHz WAV (wav.ts). It stops by
// itself after MAX_SECONDS, so a forgotten recording doesn't run on. `level()` is how loud the learner is
// right now (0 to 1), so the mic can move with their voice.
import { useCallback, useEffect, useRef, useState } from 'react'
import { say } from '../errors'
import { downsample, encodeWav } from './wav'

const RATE = 16_000
const MAX_SECONDS = 15

type Running = {
  stream: MediaStream
  context: AudioContext
  processor: ScriptProcessorNode
  chunks: Float32Array[]
  timer: number
}

export function useRecorder(onRecorded: (wav: Uint8Array) => void): {
  recording: boolean
  error?: string
  start: () => Promise<void>
  stop: () => void
  level: () => number
} {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string>()
  const running = useRef<Running>(undefined)
  const loudness = useRef(0)

  const finish = useCallback(
    (keep: boolean) => {
      const current = running.current
      if (!current) return
      running.current = undefined
      window.clearTimeout(current.timer)
      current.processor.disconnect()
      current.stream.getTracks().forEach((track) => track.stop())
      const rate = current.context.sampleRate
      void current.context.close()
      setRecording(false)
      loudness.current = 0
      if (!keep) return
      const length = current.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const samples = new Float32Array(length)
      let at = 0
      for (const chunk of current.chunks) {
        samples.set(chunk, at)
        at += chunk.length
      }
      onRecorded(encodeWav(downsample(samples, rate, RATE), RATE))
    },
    [onRecorded]
  )

  const start = useCallback(async () => {
    if (running.current) return
    setError(undefined)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true }
      })
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      // ScriptProcessor is old but needs no separate worklet file; a few seconds of a line is fine.
      const processor = context.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []
      processor.onaudioprocess = (event) => {
        const samples = new Float32Array(event.inputBuffer.getChannelData(0))
        chunks.push(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i += 4) sum += samples[i] * samples[i]
        // Speech sits around 0.02 to 0.2 RMS: scaled so a normal voice fills most of the range.
        loudness.current = Math.min(1, Math.sqrt(sum / (samples.length / 4)) * 6)
      }
      source.connect(processor)
      processor.connect(context.destination)
      running.current = {
        stream,
        context,
        processor,
        chunks,
        timer: window.setTimeout(() => finish(true), MAX_SECONDS * 1000)
      }
      setRecording(true)
    } catch (cause) {
      setError(
        say(
          cause,
          'Duet could not use the microphone. Check it is allowed in System Settings › Privacy.'
        )
      )
    }
  }, [finish])

  // Leaving the step mid-recording lets the microphone go.
  useEffect(() => () => finish(false), [finish])

  const level = useCallback(() => loudness.current, [])
  return { recording, error, start, stop: () => finish(true), level }
}
