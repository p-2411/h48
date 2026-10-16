// Watching: the videos watched with Duet, the last first, each reopened in the browser where the
// learner left off, with its reading level and how much of it the learner understands (and, above
// them, each reading level watched).
import { useState } from 'react'
import type { WatchingVideo } from '../../../shared/home'
import { levelText } from '../../../shared/progress'
import { say } from '../components/errors'
import { clock, when } from '../components/time'
import { LoadState } from '../components/LoadState'
import { levelLine, videoLine } from './progress'
import { Thumbnail } from './Thumbnail'
import { useLoaded } from './useLoaded'
import { useProgress } from './useProgress'

const loadWatching = (): Promise<WatchingVideo[]> => window.duet.home.getWatching()

export function Watching(): React.JSX.Element {
  const {
    value: videos,
    error,
    reload
  } = useLoaded(loadWatching, 'Could not load the videos you watched.')
  const progress = useProgress()
  // Continue that couldn't open the video, and why.
  const [openError, setOpenError] = useState<string>()
  const open = (key: string): void => {
    setOpenError(undefined)
    window.duet.home.openVideo(key).catch((cause) => setOpenError(say(cause, 'Could not open that video.')))
  }
  return (
    <main className="home-page">
      <h1>Watching</h1>
      <LoadState loaded={!!videos} error={error} reload={reload} />
      {openError && (
        <p className="notice error" role="alert">
          {openError}
        </p>
      )}
      {!videos ? null : videos.length === 0 ? (
        <p className="muted">
          Nothing here yet. Videos you watch with Duet show up here, so you can pick up where you
          left off.
        </p>
      ) : (
        <>
          {!!progress?.levels.length && (
            <section className="home-levels" aria-labelledby="home-levels-title">
              <h2 className="label" id="home-levels-title">
                Your reading levels
              </h2>
              <ul>
                {progress.levels.map((level) => (
                  <li key={level.level} className="glass" title={levelText(level.level)}>
                    <span className="home-level-name">Reading level {level.level}</span>
                    <span className="faint">{levelLine(level)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <ul className="home-videos">
            {videos.map((video) => {
              const title = video.title ?? `${video.siteName} video`
              const shown = progress?.videos[video.key]
              const line = videoLine(shown)
              return (
                <li key={video.key}>
                  <button type="button" className="glass home-video" aria-label={`Continue ${title}`} onClick={() => open(video.key)}>
                    <Thumbnail video={video} />
                    <span className="home-video-title">{title}</span>
                    <span className="faint">
                      {video.siteName}
                      {video.position !== undefined && ` · left off at ${clock(video.position)}`} · {when(video.lastWatched)}
                    </span>
                    {line && (
                      <span className="faint" title={shown?.level ? levelText(shown.level) : undefined}>
                        {line}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </main>
  )
}
