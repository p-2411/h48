// Which language the video is actually spoken in. Transcripts and captions can be a translation of
// the speech (Spanish subtitles on an English film), and learning from them is then reading, not
// listening. So once per video and language, after a line has finished playing, Duet listens to
// it (the same way Explain does) and the overlay says if the speech isn't the language being learnt.
// It only runs when Duet may already hear the browser; it never asks for that itself.
import type { Delivery } from './ai/voice'
import type { AudioSource } from './audio'
import type { HearingNote } from '../shared/explain'
import { languageNamed } from '../shared/languages'
import type { Moment } from '../shared/moment'
import type { Player } from './player'
import type { Settings } from './settings'
import type { Watcher } from './watcher'

// Lines tried per video before giving up (music, or speech that can't be made out).
const TRIES = 3

export class SpokenLanguageCheck {
  private done = new Set<string>()
  private tried = new Map<string, number[]>()
  private busy = false

  constructor(
    private readonly parts: {
      watcher: Watcher
      player: Player
      audio: AudioSource
      settings: Settings
      hear: (
        moment: Moment,
        signal: AbortSignal
      ) => Promise<{ delivery?: Delivery; note: HearingNote }>
    }
  ) {}

  /** Call every second or so. */
  tick(now = Date.now()): void {
    const { watcher, player, audio, settings, hear } = this.parts
    const video = watcher.currentVideo
    const line = watcher.currentLine
    // When Duet hears the lines themselves, their language is already checked.
    if (
      this.busy ||
      !video ||
      !line ||
      audio.permission !== 'granted' ||
      watcher.status.source === 'audio'
    )
      return
    const key = `${video.site}:${video.id}|${settings.current.language}`
    const tried = this.tried.get(key) ?? []
    if (this.done.has(key) || tried.includes(line.id)) return
    // Only a line that has finished playing can be heard whole.
    const position = player.now()
    const ended =
      line.end !== undefined
        ? position !== undefined && position > line.end + 0.5
        : now - line.at > 5000
    const moment = ended ? watcher.moment(line.id) : undefined
    if (!moment) return
    this.busy = true
    this.tried.set(key, [...tried, line.id])
    hear(moment, AbortSignal.timeout(10_000))
      .then(({ delivery }) => {
        if (!delivery) {
          if (tried.length + 1 >= TRIES) this.done.add(key)
          return
        }
        this.done.add(key)
        const name = delivery.spokenLanguage
        watcher.noteSpokenLanguage({ language: languageNamed(name) ?? 'other', name })
      })
      .catch(() => undefined)
      .finally(() => (this.busy = false))
  }
}
