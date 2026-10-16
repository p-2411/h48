// Continue watching: the last three videos watched with Duet, each reopened where the learner left
// off, with how much of it the learner understands; the tile opens Watching, with them all.
import { useState } from 'react'
import type { WatchingVideo } from '../../../../shared/home'
import { say } from '../../components/errors'
import { clock } from '../../components/time'
import { understood } from '../progress'
import { Thumbnail } from '../Thumbnail'
import { useLoaded } from '../useLoaded'
import { useProgress } from '../useProgress'
import { Tile } from './Tile'

const loadWatching = (): Promise<WatchingVideo[]> => window.duet.home.getWatching()

export function WatchingTile({
  onOpen
}: {
  onOpen: (tile: HTMLElement) => void
}): React.JSX.Element {
  const {
    value: videos,
    error,
    reload
  } = useLoaded(loadWatching, 'Could not load the videos you watched.')
  const progress = useProgress()
  const [openError, setOpenError] = useState<string>()
  const open = (key: string): void => {
    setOpenError(undefined)
    window.duet.home
      .openVideo(key)
      .catch((cause) => setOpenError(say(cause, 'Could not open that video.')))
  }
  return (
    <Tile
      id="watching"
      title="Watching"
      aside={videos && videos.length > 3 && <span className="faint">All {videos.length}</span>}
      loaded={!!videos}
      error={error}
      reload={reload}
      onOpen={onOpen}
    >
      {videos && videos.length === 0 && (
        <p className="muted">
          Videos you watch with Duet show up here, so you can pick up where you left off.
        </p>
      )}
      {videos && videos.length > 0 && (
        <ul className="tile-videos">
          {videos.slice(0, 2).map((video) => {
            const title = video.title ?? `${video.siteName} video`
            // Just the % now: the tile has no room for more.
            const shown = understood({ now: progress?.videos[video.key]?.now })
            return (
              <li key={video.key}>
                <button
                  type="button"
                  className="tile-video"
                  aria-label={`Continue ${title}`}
                  onClick={() => open(video.key)}
                >
                  <span className="video-frame">
                    <Thumbnail video={video} />
                    {video.subtitle && <span className="video-subtitle">{video.subtitle}</span>}
                  </span>
                  <span className="tile-video-title">{title}</span>
                  {video.position !== undefined && (
                    <span className="faint">
                      Left off at {clock(video.position)}
                      {video.words?.length ? ` · ${video.words.length} words met` : ''}
                    </span>
                  )}
                  {shown && <span className="faint">{shown}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {openError && (
        <p className="notice error" role="alert">
          {openError}
        </p>
      )}
    </Tile>
  )
}
