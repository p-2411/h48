// Duet's recorded voice for the first run: the clips scripts/record-welcome-voice.mjs made once in
// Duet's own voice (src/renderer/public/voice/welcome), played with no API call. While one plays,
// its loudness drives Duet's mouth (the same reading as components/duet/speech.ts).
import recorded from './voice-clips.json'
import { clipKey } from './lines'

const clips = new Set<string>(recorded)
let context: AudioContext | undefined
let analyser: AnalyserNode | undefined
let current: { audio: HTMLAudioElement; stop: () => void } | undefined
const samples = new Float32Array(256)

/** Whether this line, as said in this voice language, was recorded. */
export const hasClip = (lang: string, spoken: string): boolean => clips.has(clipKey(lang, spoken))

/** While developing: a line Duet may say that has no clip is listed in window.__voiceMissing, so a
 * run through (sound on or off) shows any line still to record. */
export function expectClip(lang: string, spoken: string): void {
  if (!import.meta.env.DEV || hasClip(lang, spoken)) return
  const missing = ((window as unknown as { __voiceMissing?: string[] }).__voiceMissing ??= [])
  if (!missing.includes(`${lang} ${spoken}`)) missing.push(`${lang} ${spoken}`)
}

/** Plays a line's clip; `progress` hears how far through it is (0–1). Resolves true once it has played
 * to the end (or was stopped), false if there's no clip or it couldn't play. */
export function playClip(lang: string, spoken: string, progress?: (fraction: number) => void): Promise<boolean> {
  stopVoice()
  const key = clipKey(lang, spoken)
  if (!clips.has(key)) return Promise.resolve(false)
  const audio = new Audio(new URL(`./voice/welcome/${key}.mp3`, document.baseURI).href)
  try {
    context ??= new AudioContext()
    analyser ??= Object.assign(context.createAnalyser(), { fftSize: samples.length })
    const source = context.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(context.destination)
    void context.resume().catch(() => undefined)
  } catch {
    // Without the analyser the clip still plays (straight out); the mouth keeps its own rhythm.
  }
  return new Promise((resolve) => {
    let started = false
    const timer = setInterval(() => {
      if (audio.duration) progress?.(audio.currentTime / audio.duration)
    }, 40)
    const end = (played: boolean): void => {
      clearInterval(timer)
      if (current?.audio === audio) current = undefined
      resolve(played)
    }
    current = {
      audio,
      stop: () => {
        audio.pause()
        end(started)
      }
    }
    audio.onplaying = () => (started = true)
    audio.onended = () => end(true)
    audio.onerror = () => end(false)
    audio.play().catch(() => end(false))
  })
}

/** Stops whatever Duet is saying, recorded or the system's voice. */
export function stopVoice(): void {
  current?.stop()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}

/** How loud the clip playing is right now (0–1), or null when none is: for Duet's mouth. */
export function voiceLevel(): number | null {
  if (!current || !analyser || current.audio.paused) return null
  analyser.getFloatTimeDomainData(samples)
  let energy = 0
  for (const sample of samples) energy += sample * sample
  const rms = Math.sqrt(energy / samples.length)
  return Math.pow(Math.min(1, Math.max(0, (rms - 0.008) * 6)), 0.75)
}
