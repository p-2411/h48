// Hearing a line: cuts the line out of the audio the reader keeps, and asks the listening model how
// it was said. Used by Explain, so the tone can come from the actual delivery and not only the words.
import type { HearingNote } from '../shared/explain'
import type { Moment } from '../shared/moment'
import type { Delivery, DeliveryListener } from './ai/voice'
import type { AudioSource } from './audio'
import type { Player } from './player'

// Margins around a line, in seconds: subtitle timings are approximate.
const LEAD = 0.25
const TAIL = 0.4
// A caption read from the screen has no end time: take this long from when it appeared.
const CAPTION_MS = 4500
// The listening model gets this long before Explain goes ahead without it.
const LISTEN_TIMEOUT_MS = 8000

export async function hearLine(
  moment: Moment,
  { audio, player, listener }: { audio: AudioSource; player: Player; listener?: DeliveryListener },
  signal?: AbortSignal
): Promise<{ delivery?: Delivery; note: HearingNote }> {
  if (!listener || audio.permission === 'unavailable') return { note: 'off' }
  if (audio.permission === 'not-asked') {
    // The first time the learner asks for help is the time to ask for the permission.
    audio.requestPermission()
    return { note: 'asking' }
  }
  if (audio.permission === 'denied') return { note: 'not-allowed' }

  const { line } = moment
  const now = Date.now()
  let from: number | undefined
  let to: number | undefined
  if (line.end !== undefined && line.start !== undefined) {
    from = player.playedAt(Math.max(0, line.start - LEAD))
    const end = player.playedAt(line.end + TAIL)
    to = end ?? (from !== undefined ? Math.min(now, from + (line.end - line.start + LEAD + TAIL) * 1000) : undefined)
  } else {
    from = line.at - LEAD * 1000
    to = Math.min(now, line.at + CAPTION_MS)
  }
  if (from === undefined || to === undefined || to - from < 500) return { note: 'not-kept' }
  const clip = await audio.clip(from, to)
  if (!clip) return { note: 'not-kept' }

  const timeout = AbortSignal.timeout(LISTEN_TIMEOUT_MS)
  const delivery = await listener
    .describe(clip, { original: line.original, language: moment.language }, signal ? AbortSignal.any([signal, timeout]) : timeout)
    .catch(() => undefined)
  return delivery ? { delivery, note: 'heard' } : { note: 'unclear' }
}
