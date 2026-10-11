// Lines from the audio, for videos with neither a transcript nor captions: Duet listens to the
// browser (through the audio reader), cuts the speech where the speaker pauses, and transcribes each
// piece in the language being learnt. Each piece then goes through the same path as a caption read
// from the screen: translation, the mixed line, Script, Explain.
//
// It starts on its own once the watcher says a video needs hearing (see Watcher.needsHearing) and
// stops when captions appear, the video pauses, or the video changes.
import type { SpeechToText } from './ai/voice'
import type { AudioSource } from './audio'
import type { Player } from './player'
import type { Settings } from './settings'
import type { Watcher } from './watcher'

const RATE = 16_000
const FRAME_MS = 100
// A piece needs at least this much speech, ends at a pause at least this long, and is cut anyway
// once it gets this long.
const MIN_SPEECH_MS = 900
const PAUSE_MS = 400
const MAX_PIECE_MS = 8000
// With no speech in this long, the waiting audio is dropped.
const SILENCE_DROP_MS = 4000
// Quieter than this (or than a share of the loudest frames) counts as a pause.
const FLOOR = 0.006
const SHARE_OF_LOUD = 0.3

// What speech models write on music or silence, not speech.
const FILLER =
  /^(gracias por ver( el video)?|suscr[ií]bete|subt[ií]tulos.*|thank(s| you) for watching|ご視聴ありがとうございました|시청해 ?주셔서 감사합니다|[♪♫.…\s-]*)$/i

function samplesOf(wav: Uint8Array): Int16Array {
  // The reader sends 16 kHz mono 16-bit WAV with a 44-byte header.
  return new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength - ((wav.byteLength - 44) % 2)))
}

function wavOf(samples: Int16Array): Uint8Array {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string): void => [...value].forEach((char, index) => out.setUint8(at + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  out.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVEfmt ')
  out.setUint32(16, 16, true)
  out.setUint16(20, 1, true)
  out.setUint16(22, 1, true)
  out.setUint32(24, RATE, true)
  out.setUint32(28, RATE * 2, true)
  out.setUint16(32, 2, true)
  out.setUint16(34, 16, true)
  text(36, 'data')
  out.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => out.setInt16(44 + index * 2, sample, true))
  return new Uint8Array(out.buffer)
}

/** Loudness of each 100 ms frame, 0 to 1. */
function frameLevels(samples: Int16Array): number[] {
  const size = (RATE * FRAME_MS) / 1000
  const levels: number[] = []
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0
    for (let index = start; index < start + size; index++) sum += (samples[index] / 32768) ** 2
    levels.push(Math.sqrt(sum / size))
  }
  return levels
}

/** Where to end the piece (in frames), or undefined to wait for more; also where speech began. */
export function findCut(levels: number[]): { cut?: number; speechFrom?: number; speech: boolean } {
  const loud = [...levels].sort((a, b) => b - a)[Math.floor(levels.length * 0.1)] ?? 0
  const threshold = Math.max(FLOOR, loud * SHARE_OF_LOUD)
  const speaking = levels.map((level) => level > threshold)
  const speechFrom = speaking.indexOf(true)
  if (speechFrom < 0) return { speech: false }
  const pauseFrames = PAUSE_MS / FRAME_MS
  let speechFrames = 0
  let quiet = 0
  for (let index = speechFrom; index < speaking.length; index++) {
    if (speaking[index]) {
      speechFrames++
      quiet = 0
    } else if (++quiet >= pauseFrames && speechFrames * FRAME_MS >= MIN_SPEECH_MS) {
      return { cut: index - Math.floor(quiet / 2), speechFrom, speech: true }
    }
  }
  if (levels.length * FRAME_MS >= MAX_PIECE_MS) {
    // No pause: cut at the quietest frame of the last two seconds.
    const from = Math.max(speechFrom + 1, levels.length - 2000 / FRAME_MS)
    let quietest = levels.length - 1
    for (let index = from; index < levels.length; index++) if (levels[index] < levels[quietest]) quietest = index
    return { cut: quietest, speechFrom, speech: true }
  }
  return { speechFrom, speech: true }
}

export class Hearing {
  private active = false
  private busy = false
  private pieceFrom = 0
  private before = ''
  private asked = false

  constructor(
    private readonly parts: {
      watcher: Watcher
      player: Player
      audio: AudioSource
      speech?: SpeechToText
      settings: Settings
    }
  ) {}

  /** Call every half second or so. */
  tick(now = Date.now()): void {
    const { watcher, player, audio, speech } = this.parts
    // Playing, or no way to tell (Netflix with its controls hidden): then the audio itself decides,
    // as pieces with no speech in them are skipped before anything is transcribed.
    const wanted = !!speech && watcher.needsHearing && (player.playing || !player.stateKnown)
    // Hearing a video with no captions is something the learner is plainly using Duet for, so this
    // is a fair moment to ask for the permission (once).
    if (wanted && audio.permission === 'not-asked' && !this.asked) {
      this.asked = true
      audio.requestPermission()
    }
    const on = wanted && audio.permission === 'granted'
    if (on !== this.active) {
      this.active = on
      this.pieceFrom = now
      this.before = ''
      watcher.setHearing(on)
    }
    if (!this.active || this.busy) return
    this.busy = true
    void this.step(now).finally(() => (this.busy = false))
  }

  private async step(now: number): Promise<void> {
    const { watcher, player, audio, speech, settings } = this.parts
    const clip = await audio.clip(this.pieceFrom, now)
    if (!clip) {
      // Nothing audible kept yet: after a while, stop waiting on it.
      if (now - this.pieceFrom > SILENCE_DROP_MS) this.pieceFrom = now - 500
      return
    }
    const samples = samplesOf(clip.data)
    const levels = frameLevels(samples)
    const { cut, speechFrom, speech: heard } = findCut(levels)
    if (!heard) {
      if (now - this.pieceFrom > SILENCE_DROP_MS) this.pieceFrom = now - 500
      return
    }
    if (cut === undefined || speechFrom === undefined) return
    const frame = (RATE * FRAME_MS) / 1000
    const start = Math.max(0, speechFrom - 1) * frame
    const piece = samples.slice(start, cut * frame)
    const pieceFrom = this.pieceFrom
    this.pieceFrom = pieceFrom + cut * FRAME_MS
    const spokenAt = pieceFrom + (start / RATE) * 1000
    const language = settings.current.language
    const result = await speech!
      .transcribe({ data: wavOf(piece), mimeType: 'audio/wav' }, language, undefined, { only: true, before: this.before })
      .catch((error) => {
        console.error('[duet] hearing failed', error instanceof Error ? error.message : error)
        return { text: '' }
      })
    const text = result.text.replace(/\s+/g, ' ').trim()
    if (!this.active || !text || FILLER.test(text)) return
    this.before = text
    const position = player.now()
    watcher.addHeardLine(text, spokenAt, position === undefined ? undefined : Math.max(0, position - (Date.now() - spokenAt) / 1000))
  }
}
