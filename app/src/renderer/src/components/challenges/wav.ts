// The learner's recording as WAV (16-bit, mono), the format the audio models take. Plain functions,
// so they can be tested without a microphone.

/** Fewer samples a second: each new sample is the average of the ones it stands for. */
export function downsample(samples: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return samples
  const ratio = from / to
  const out = new Float32Array(Math.floor(samples.length / ratio))
  for (let index = 0; index < out.length; index++) {
    const start = Math.floor(index * ratio)
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio))
    let sum = 0
    for (let at = start; at < end; at++) sum += samples[at]
    out[index] = sum / Math.max(1, end - start)
  }
  return out
}

/** A WAV file of `samples` (−1 to 1; louder is clipped) at `sampleRate`. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const write = (at: number, text: string): void => [...text].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true) // the format chunk's size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes a second
  view.setUint16(32, 2, true) // bytes a sample
  view.setUint16(34, 16, true) // bits a sample
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff), true)
  })
  return bytes
}
