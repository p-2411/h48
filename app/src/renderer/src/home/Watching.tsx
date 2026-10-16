import { useState } from 'react'
import type { WatchingVideo } from '../../../shared/home'
import { say } from '../components/errors'
import { ago, clock } from '../components/time'
import { LoadState } from '../components/LoadState'
import { Thumbnail } from './Thumbnail'
import { useLoaded } from './useLoaded'
const loadWatching = (): Promise<WatchingVideo[]> => window.duet.home.getWatching()
export function Watching(): React.JSX.Element {
  const {
    value: videos,
    error,
    reload
  } = useLoaded(loadWatching, 'Could not load the videos you watched.')
  const [openError, setOpenError] = useState<string>(),
    [filter, setFilter] = useState('all')
  const open = (key: string): void => {
    setOpenError(undefined)
    void window.duet.home
      .openVideo(key)
      .catch((cause) => setOpenError(say(cause, 'Could not open that video.')))
  }
  const shown = videos?.filter((video) => filter === 'all' || (video.position ?? 0) > 0)
  return (
    <main className="home-page watching-page">
      <h1>Watching</h1>
      <div className="watch-toolbar">
        <p className="watch-lede">Pick up where you left off.</p>
        <div className="seg" role="group" aria-label="Videos">
          <button
            className={filter === 'all' ? 'selected' : ''}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={filter === 'continuing' ? 'selected' : ''}
            aria-pressed={filter === 'continuing'}
            onClick={() => setFilter('continuing')}
          >
            Still watching
          </button>
        </div>
      </div>
      <LoadState loaded={!!videos} error={error} reload={reload} />
      {openError && (
        <p className="notice error" role="alert">
          {openError}
        </p>
      )}
      {shown?.length === 0 && (
        <p className="muted">
          {videos?.length
            ? 'No videos with a saved position yet.'
            : 'Videos you watch with Duet show up here, so you can pick up where you left off.'}
        </p>
      )}
      <ul className="home-videos">
        {shown?.map((video) => (
          <li key={video.key}>
            <button
              className="home-video glass"
              aria-label={`Continue ${video.title ?? video.siteName}`}
              onClick={() => open(video.key)}
            >
              <span className="video-frame">
                <Thumbnail video={video} />
                {video.subtitle && <span className="video-subtitle">{video.subtitle}</span>}
              </span>
              <span className="home-video-title">{video.title ?? `${video.siteName} video`}</span>
              <span className="faint">
                {video.siteName}
                {video.position !== undefined && ` · left off at ${clock(video.position)}`} ·{' '}
                {ago(video.lastWatched)}
              </span>
              {!!video.words?.length && (
                <span className="video-words">
                  {video.words.slice(0, 6).map((word) => (
                    <span className="w" data-k={word.state} key={word.key}>
                      {word.word}
                    </span>
                  ))}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
export function FloatingWatching(): React.JSX.Element {
  const { value: videos, error, reload } = useLoaded(loadWatching, 'Could not load Watching.')
  const [failure, setFailure] = useState<string>()
  const video = videos?.[0]
  if (!video)
    return (
      <div className="floating-empty">
        <LoadState loaded={!!videos} error={error} reload={reload} />
        {videos && <p className="muted">Your last video will appear here.</p>}
      </div>
    )
  return (
    <>
      <button
        className="floating-video"
        aria-label={`Continue ${video.title ?? video.siteName}`}
        onClick={() => {
          void window.duet.home
            .openVideo(video.key)
            .catch((cause) => setFailure(say(cause, 'Could not open this video.')))
        }}
      >
        <Thumbnail video={video} />
        <span className="floating-caption">
          {video.subtitle ?? video.title ?? video.siteName}
          {video.position !== undefined && ` · ${clock(video.position)}`}
        </span>
      </button>
      {failure && <p role="alert">{failure}</p>}
    </>
  )
}
