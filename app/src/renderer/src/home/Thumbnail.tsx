// A video's picture, for Watching and its tile: YouTube's own thumbnail; for a video without one
// (Netflix has none to give) or one that fails to load, a dark panel with the site's name.
import { useState } from 'react'
import type { WatchingVideo } from '../../../shared/home'

export function Thumbnail({ video }: { video: WatchingVideo }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const picture =
    video.site === 'youtube' && !failed
      ? `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`
      : undefined
  return (
    <div className={`thumb thumb-${video.site}`}>
      {picture ? (
        <img src={picture} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-site">{video.siteName}</span>
      )}
    </div>
  )
}
