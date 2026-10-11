// Talk, main-process side: a free conversation with Duet in the home base, in the language being
// learnt and at the learner's level, typed or spoken (voice runs in the page, as in Explain), with no
// video line; the learner's saved cards are open to Duet. The thread is kept while Duet runs, so going
// back to Talk goes on with it; New conversation starts over. A free conversation begun on the strip
// (src/main/talk/strip.ts) goes on here when the learner picks Text chat.
//
// IPC (from the home page only; window.duet.talk in src/preload/talk.ts):
//   talk:open         → ThreadState: Talk is on show; the tutor is the home window's again
//   talk:new          → ThreadState: a new, empty conversation
//   talk:get-state    → ThreadState
//   talk:ask          the learner's message (the same message again, after a failed reply, asks again)
//   talk:voice-turns  turns of a voice conversation that just ended, to keep in the thread
//   talk:state        ← sent whenever the thread changes
import type { ThreadState } from '../../shared/explain'
import type { Language, Level } from '../../shared/types'
import { ownedHandler } from '../ipc/owned'
import type { Tutor, TutorWindow } from '../tutor'
import type { FreeContext } from '../tutor/prompts'
import { ChatThread } from '../tutor/thread'

type Deps = {
  tutor: Pick<Tutor, 'open' | 'forWindow'>
  settings: { current: { language: Language; level: Level } }
  /** The home window. */
  window: TutorWindow
}

export class Talk {
  private readonly thread: ChatThread

  constructor({ tutor, settings, window }: Deps) {
    const context = (): FreeContext => ({
      kind: 'free',
      language: settings.current.language,
      level: settings.current.level,
      conversation: this.thread.state.chat,
      exploreEnabled: true
    })
    this.thread = new ChatThread(tutor.forWindow(window, context), (state) => window.send('talk:state', state))
    const handle = ownedHandler('talk', (sender) => window.owns(sender), 'Not allowed: Talk is in the home base.')
    const open = (): ThreadState => {
      tutor.open(context(), window)
      return this.thread.state
    }
    handle('open', open)
    handle('new', () => {
      this.thread.reset()
      return open()
    })
    handle('get-state', () => this.thread.state)
    handle('ask', (message) => this.thread.ask(String(message ?? '')))
    handle('voice-turns', (turns) => this.thread.addVoiceTurns(turns))
  }

  /** A free conversation from the strip goes on here: a new thread, with its turns. */
  openWithTurns(turns: unknown): void {
    this.thread.reset()
    this.thread.addVoiceTurns(turns)
  }
}
