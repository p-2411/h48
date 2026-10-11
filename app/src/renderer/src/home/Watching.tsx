// Watching: the videos watched with Duet, the last first, each reopened in the browser where the
// learner left off.
import type { WatchingVideo } from '../../../shared/home'
import { clock, when } from '../components/time'
import { LoadState } from './LoadState'
import { useLoaded } from './useLoaded'

const loadWatching = (): Promise<WatchingVideo[]> => window.duet.home.getWatching()

export function Watching(): React.JSX.Element {
  const {
    value: videos,
    error,
    reload
  } = useLoaded(loadWatching, 'Could not load the videos you watched.')
  return (
    <main className="home-page">
      <h1>Watching</h1>
      <LoadState loaded={!!videos} error={error} reload={reload} />
      {!videos ? null : videos.length === 0 ? (
        <p className="muted">
          Nothing here yet. Videos you watch with Duet show up here, so you can pick up where you
          left off.
        </p>
      ) : (
        <ul className="home-videos">
          {videos.map((video) => {
            const title = video.title ?? `${video.siteName} video`
            return (
              <li key={video.key}>
                <span className="home-video-title">{title}</span>
                <span className="faint">
                  {video.siteName}
                  {video.position !== undefined && ` · left off at ${clock(video.position)}`} ·{' '}
                  {when(video.lastWatched)}
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Continue ${title}`}
                  onClick={() => window.duet.home.openVideo(video.key)}
                >
                  Continue
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
