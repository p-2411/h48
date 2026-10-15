// Feeds the watch log: the video on screen and where it is, time spent watching with Duet (only
// while the video plays and Duet is shown), lines as they come on screen translated, cards saved,
// lines explained and words hovered on the strip; each new line's words are also seen once more on
// the knowledge ladder, and its words new to the video are credited as known right then (progress).
// index.ts calls tick() from its main loop and finish() when Duet quits.
//
// The log is a record, not a feature: every write here runs inside another feature's event or
// loop, so a failing write (disk full, a locked database) is reported and dropped, never thrown
// into subtitles, saving or the main loop.
import type { EventEmitter } from 'events'
import type { Card } from '../../shared/cards'
import { pairText } from '../../shared/levels'
import type { Moment } from '../../shared/moment'
import type { Language, OverlayLine } from '../../shared/types'
import type { Knowledge } from '../knowledge'
import type { Progress } from '../progress'
import { videoKey, type WatchedVideo, type WatchLog } from '.'

// A gap between ticks longer than this (the Mac slept, the loop stalled) counts as this much.
export const MAX_TICK_MS = 1_000
// How often the video's record (title, where it is) is brought up to date.
const VIDEO_EVERY_MS = 15_000

export type WatchSource = EventEmitter & {
  currentVideo?: WatchedVideo
  currentLine?: OverlayLine
  moment(lineId?: number): Moment | undefined
}

export type WatchLogLink = {
  /** Call often (index.ts's main loop): counts watch time and keeps the video's record current. */
  tick(now?: number): void
  /** The learner opened Explain on a moment. */
  explained(moment: Moment): void
  /** The learner rested the pointer on a word of a line on the strip. */
  hovered(lineId: number, text: string): void
  /** Duet is quitting: writes where the video is now and the watch time not yet written. */
  finish(now?: number): void
}

/** The key of the video a moment is from, when it names one. */
function momentVideo(moment: Moment | undefined): string | undefined {
  return moment?.video.id ? videoKey({ site: moment.video.site, id: moment.video.id }) : undefined
}

/** Runs a write to the log; a failure is reported and goes no further. */
function record(work: () => void): void {
  try {
    work()
  } catch (error) {
    console.error('[duet] watch log', error)
  }
}

export function connectWatchLog(
  log: WatchLog,
  {
    watcher,
    player,
    settings,
    cards,
    knowledge,
    progress,
    shown
  }: {
    watcher: WatchSource
    player: { playing: boolean; now(): number | undefined }
    settings: { current: { language: Language } }
    cards: EventEmitter
    /** The knowledge ladder: each word of a line met is seen once more (src/main/knowledge). */
    knowledge?: Pick<Knowledge, 'noteSeen'>
    /** Progress: each line's words new to its video credited as known when met (src/main/progress). */
    progress?: Pick<Progress, 'noteMet'>
    /** Duet is on screen (the strip is shown): only then is watching "with Duet", and a line met. */
    shown: () => boolean
  }
): WatchLogLink {
  const language = (): Language => settings.current.language
  const onScreen = (): string | undefined =>
    watcher.currentVideo ? videoKey(watcher.currentVideo) : undefined
  let lastTick: number | undefined
  let videoNotedAt: number | undefined
  let notedKey: string | undefined
  // The video last noted while it played: on record, so its lines can be met.
  let watchedKey: string | undefined

  const noteVideo = (now: number): void => {
    const video = watcher.currentVideo
    if (!video) return
    const watching = player.playing
    log.noteVideo(video, language(), player.now(), now, { watching })
    videoNotedAt = now
    notedKey = videoKey(video)
    if (watching) watchedKey = notedKey
  }

  // A line is met when it is on screen and translated, whichever happens last.
  const meet = (line: OverlayLine | undefined): void => {
    const key = onScreen()
    if (!key || !line || line.id !== watcher.currentLine?.id || !shown()) return
    if (watchedKey !== key) noteVideo(Date.now())
    if (log.noteLine(key, language(), line) && line.processed) {
      knowledge?.noteSeen(language(), line.processed)
      progress?.noteMet(key, language())
    }
  }
  watcher.on('current', () => record(() => meet(watcher.currentLine)))
  watcher.on('line', (line: OverlayLine) => record(() => meet(line)))

  cards.on('saved', (card: Card) =>
    record(() => {
      const moment = card.source.kind === 'video' ? card.source.moment : undefined
      log.noteWord({
        kind: 'saved',
        videoKey: momentVideo(moment),
        language: card.language,
        text: card.expression,
        line: moment?.line.original,
        start: moment?.line.start
      })
    })
  )

  return {
    tick(now = Date.now()) {
      const since = lastTick === undefined ? 0 : Math.min(now - lastTick, MAX_TICK_MS)
      lastTick = now
      const key = onScreen()
      if (!key || !shown()) return
      record(() => {
        // Note the video when it changes, the moment it starts playing (so it is on record at once),
        // and every VIDEO_EVERY_MS.
        const due =
          key !== notedKey ||
          (player.playing && key !== watchedKey) ||
          videoNotedAt === undefined ||
          now - videoNotedAt >= VIDEO_EVERY_MS
        if (due) noteVideo(now)
        if (player.playing) log.addWatchTime(since, key, now)
      })
    },
    finish(now = Date.now()) {
      record(() => {
        if (onScreen() && shown()) noteVideo(now)
        log.flush(now)
      })
    },
    explained(moment) {
      record(() =>
        log.noteWord({
          kind: 'explained',
          videoKey: momentVideo(moment),
          language: moment.language,
          text: moment.line.original,
          line: moment.line.original,
          start: moment.line.start
        })
      )
    },
    hovered(lineId, text) {
      // The strip only names a line and a word: both are checked against the line itself, and the
      // word must be one the strip names (a pair's words written out, see pairText).
      if (typeof lineId !== 'number' || typeof text !== 'string') return
      const moment = watcher.moment(lineId)
      const video = momentVideo(moment)
      const source = moment?.line.processed?.source ?? []
      const named = source.some(
        (token) => token.pair !== null && pairText(source, token.pair) === text
      )
      if (!moment || !video || !named) return
      record(() =>
        log.noteWord({
          kind: 'hovered',
          videoKey: video,
          language: moment.language,
          text,
          line: moment.line.original,
          start: moment.line.start
        })
      )
    }
  }
}
