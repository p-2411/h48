// A checkpoint, above the strip: one challenge from the last few minutes of the video, which waits
// meanwhile. Answering it keeps the day's streak; skipping just closes it.
import type { CheckpointView } from '../../../shared/checkpoints'
import { Meaning } from '../components/challenges/Meaning'
import { Recall } from '../components/challenges/Recall'
import { SayLine } from '../components/challenges/SayLine'

export function Checkpoint({ view, onClose }: { view: CheckpointView; onClose: () => void }): React.JSX.Element {
  const api = window.duet.checkpoint
  const finish = (answered: boolean): void => {
    void (answered ? api.done() : api.close()).catch(() => undefined).finally(onClose)
  }
  return (
    <div className="checkpoint" data-solid role="dialog" aria-label="Checkpoint">
      {view.kind === 'recall' && <Recall challenge={view} api={api} onNext={finish} />}
      {view.kind === 'say' && <SayLine line={view} api={api} onNext={finish} />}
      {view.kind === 'meaning' && <Meaning challenge={view} api={api} onNext={finish} />}
    </div>
  )
}
