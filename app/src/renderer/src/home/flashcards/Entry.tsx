// The dictionary entry: a card's back, and the word in Words, look the same. Headword in syllables
// with its step's highlighter, sound and part of speech, the meaning that fits, where it was last
// heard (like a dictionary's quotation), and one folded row of tips.
import type { DictEntry, LastHeard, SplitLine, Step, Tip } from '../../../../shared/flashcards'
import { icons, mmss, times } from './bits'

export type EntryData = {
  word: string
  step: Step
  entry?: DictEntry
  meaning?: string
  line?: SplitLine
  lastHeard?: LastHeard
  heardTimes: number
  tips: Tip[]
  /** A hand-made card's line: whether Duet wrote it. */
  byDuet?: boolean
}

/** Duet's little "made by Duet" mark: its two eyes. */
export function ByDuet(): React.JSX.Element {
  return (
    <span className="fc-by-duet" aria-hidden="true">
      <i />
      <i />
    </span>
  )
}

/** The step a word is on, as a dot in its colour. */
export function StepDot({ step }: { step: Step }): React.JSX.Element {
  return <span className="dot" data-step={step} aria-hidden="true" />
}

/** A line with its word bold. */
export function Bolded({ line }: { line: SplitLine }): React.JSX.Element {
  if (!line.found) return <>{line.before}</>
  return (
    <>
      {line.before}
      <b>{line.word}</b>
      {line.after}
    </>
  )
}

export function Entry({
  data,
  headRef,
  onSound,
  onReplay
}: {
  data: EntryData
  /** The headword, for the reveal's glide. */
  headRef?: React.Ref<HTMLSpanElement>
  onSound?: () => void
  onReplay?: () => void
}): React.JSX.Element {
  const { entry, line, lastHeard } = data
  const headword = entry?.syllables ?? entry?.word ?? data.word
  const meta = [entry?.pos, entry?.gender].filter(Boolean).join(', ')
  return (
    <div className="fc-entry">
      <span className="fc-hw mark" data-step={data.step} ref={headRef}>
        {entry?.article && <span className="art">{entry.article} </span>}
        {headword}
      </span>
      {(entry?.ipa || meta || onSound) && (
        <div className="fc-meta">
          {entry?.ipa && <span>{entry.ipa}</span>}
          {onSound && (
            <button
              type="button"
              className="fc-round"
              aria-label={`Hear ${data.word}`}
              onClick={onSound}
            >
              {icons.sound}
            </button>
          )}
          {meta && (
            <>
              <span className="sep" aria-hidden="true" />
              <span className="pos">{meta}</span>
            </>
          )}
        </div>
      )}
      {data.meaning && <p className="fc-def">{data.meaning}</p>}
      {line && (
        <div className="fc-cite">
          <p className="fc-cite-line">
            <Bolded line={line} />
          </p>
          {lastHeard ? (
            <p className="fc-cite-src">
              {lastHeard.replayable && onReplay && (
                <button
                  type="button"
                  className="fc-round"
                  aria-label={`Play it again in ${lastHeard.video}`}
                  onClick={onReplay}
                >
                  {icons.play()}
                </button>
              )}
              <span>
                Last heard in <b>{lastHeard.video}</b>
                {lastHeard.at !== undefined && ` at ${mmss(lastHeard.at)}`}
              </span>
              {data.heardTimes > 0 && <span className="times">Heard {times(data.heardTimes)}</span>}
            </p>
          ) : (
            <p className="fc-cite-src">
              {data.byDuet && <ByDuet />}
              <span>{data.byDuet ? 'An example by Duet' : 'Your own line'}</span>
              <span className="times">Not heard yet</span>
            </p>
          )}
        </div>
      )}
      {data.tips.length > 0 && (
        <details className="fc-tips">
          <summary>Tips{icons.chev}</summary>
          <div>
            {data.tips.map((tip, index) => (
              <div className="fc-tip" key={index}>
                <span className="k">{tip.label}</span>
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
