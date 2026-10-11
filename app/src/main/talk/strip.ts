// Talking to Duet from the strip: the mascot button (or the talk keys) starts voice at once, at any
// time: about the line on screen when there is one, else a free conversation in the language being
// learnt. The strip's page runs the voice (as Explain's does), and the video waits while it is live
// (the tutor holds it). "Text chat" goes on in writing: in Explain on the same line, or, with no line,
// in Talk in the home base; with the turns so far.
//
// IPC (from the strip only; window.duet.talkHere in src/preload/overlay.ts):
//   duet:talk          → { moment?, language }: the conversation opens, owned by the strip
//   duet:talk-to-text  the turns so far → Explain (or Talk) goes on with them
//   duet:talk-end      the strip's conversation is over (its previews and any hold end)
//   duet:talk-keys     ← the talk keys were pressed: start talking (or end it)
import type { Moment } from '../../shared/moment'
import type { Language, Level } from '../../shared/types'
import { ownedHandler } from '../ipc/owned'
import type { Tutor, TutorWindow } from '../tutor'

type Deps = {
  watcher: { moment(): Moment | undefined }
  settings: { current: { language: Language; level: Level } }
  tutor: Pick<Tutor, 'open' | 'end'>
  explain: { openWithTurns(moment: Moment, turns: unknown): void }
  talk: { openWithTurns(turns: unknown): void }
  /** Opens the home base on Talk. */
  openTalk: () => void
  /** The strip's window. */
  window: TutorWindow
}

export class StripTalk {
  // The conversation under way: about a line (moment), or free.
  private talking?: { moment?: Moment }

  constructor({ watcher, settings, tutor, explain, talk, openTalk, window }: Deps) {
    const handle = ownedHandler('duet', (sender) => window.owns(sender), 'Not allowed: this is the strip’s.')
    handle('talk', (): { moment?: Moment; language: Language } => {
      const moment = watcher.moment()
      const { language, level } = settings.current
      this.talking = { moment }
      if (moment) {
        tutor.open({ moment }, window)
        return { moment, language: moment.language }
      }
      tutor.open({ kind: 'free', language, level }, window)
      return { language }
    })
    handle('talk-to-text', (turns) => {
      const talking = this.talking
      if (!talking) throw new Error('Start talking first.')
      this.talking = undefined
      if (talking.moment) return explain.openWithTurns(talking.moment, turns)
      talk.openWithTurns(turns)
      openTalk()
    })
    handle('talk-end', () => {
      this.talking = undefined
      tutor.end(window)
    })
  }
}
