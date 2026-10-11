// A checkpoint, above the strip: one challenge from the last few minutes of the video, which waits
// meanwhile. Answering it keeps the day's streak; skipping just closes it. If keeping the day fails,
// the strip says so (onError) as the card closes.
import type { CheckpointView } from '../../../shared/checkpoints'
import { say } from '../components/errors'
import { Meaning } from '../components/challenges/Meaning'
import { Recall } from '../components/challenges/Recall'
import { SayLine } from '../components/challenges/SayLine'

export function Checkpoint({
  view,
  onClose,
  onError
}: {
  view: CheckpointView
  onClose: () => void
  onError: (text: string) => void
}): React.JSX.Element {
  const api = window.duet.checkpoint
  const finish = (answered: boolean): void => {
    void (answered ? api.done() : api.close())
      .catch((cause) => onError(say(cause, answered ? 'Could not count that checkpoint for today.' : 'Could not close the checkpoint.')))
      .finally(onClose)
  }
  // Placed above the strip, and opened and closed, by the strip (Overlay.tsx).
  return (
    <>
      {view.kind === 'recall' && <Recall challenge={view} api={api} onNext={finish} />}
      {view.kind === 'say' && <SayLine line={view} api={api} onNext={finish} />}
      {view.kind === 'meaning' && <Meaning challenge={view} api={api} onNext={finish} />}
    </>
  )
}
