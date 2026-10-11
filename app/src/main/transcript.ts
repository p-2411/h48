// YouTube transcripts: the whole caption track of a video, with timings, fetched without the
// captions being turned on.
//
// Ported from youtube-transcript-api (MIT, https://github.com/jdepoix/youtube-transcript-api,
// v1.2.4): load the watch page for its API key, ask the player API as the Android app for the caption
// tracks, then download the chosen track as XML. When YouTube changes this, that project usually
// ships the fix first; copy it here. Runs on the viewer's own machine and connection: YouTube blocks
// cloud servers, so this must not move to a backend.
import type { Language } from '../shared/types'

export type TranscriptLine = { text: string; start: number; end: number }

const WATCH_URL = 'https://www.youtube.com/watch?v='
const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?key='
const CLIENT = { clientName: 'ANDROID', clientVersion: '20.10.38' }
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US'
}

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string }

/** The video id in a YouTube watch or Shorts address, if it is one. */
export function youtubeVideoId(address: string | undefined): string | undefined {
  if (!address) return undefined
  try {
    const url = new URL(address)
    if (!url.hostname.endsWith('youtube.com')) return undefined
    if (url.pathname === '/watch') return url.searchParams.get('v') ?? undefined
    return url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1]
  } catch {
    return undefined
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

async function watchPage(videoId: string, signal?: AbortSignal): Promise<string> {
  const load = async (cookie?: string): Promise<string> => {
    const response = await fetch(WATCH_URL + videoId, { headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) }, signal })
    if (!response.ok) throw new Error(`YouTube answered ${response.status}`)
    return response.text()
  }
  let html = await load()
  // In the EU the page is a cookie consent form first; accept it the way the library does.
  if (html.includes('action="https://consent.youtube.com/s"')) {
    const consent = html.match(/name="v" value="(.*?)"/)?.[1]
    if (!consent) throw new Error('YouTube asked for cookie consent')
    html = await load(`CONSENT=YES+${consent}`)
  }
  return html
}

async function captionTracks(videoId: string, signal?: AbortSignal): Promise<CaptionTrack[]> {
  const html = await watchPage(videoId, signal)
  const key = html.match(/"INNERTUBE_API_KEY":\s*"([\w-]+)"/)?.[1]
  if (!key) throw new Error(html.includes('class="g-recaptcha"') ? 'YouTube is blocking requests from this network' : 'YouTube page not understood')
  const response = await fetch(PLAYER_URL + key, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: { client: CLIENT }, videoId }),
    signal
  })
  if (!response.ok) throw new Error(`YouTube answered ${response.status}`)
  const data = await response.json()
  return data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
}

/** The video's own captions in this language, or undefined when it has none. Made captions are
 * preferred over YouTube's automatic ones; YouTube's machine translations are never used. */
export async function fetchTranscript(
  videoId: string,
  language: Language,
  signal?: AbortSignal
): Promise<TranscriptLine[] | undefined> {
  const tracks = (await captionTracks(videoId, signal)).filter(
    (track) => track.languageCode === language || track.languageCode.startsWith(`${language}-`)
  )
  const track = tracks.find((item) => item.kind !== 'asr') ?? tracks[0]
  if (!track) return undefined
  const url = track.baseUrl.replace('&fmt=srv3', '')
  // This marks a track that needs a proof-of-origin token, which only YouTube's own player has.
  if (url.includes('&exp=xpe')) throw new Error('YouTube wants a token for this transcript')
  const response = await fetch(url, { headers: HEADERS, signal })
  if (!response.ok) throw new Error(`YouTube answered ${response.status}`)
  const xml = await response.text()
  const lines: TranscriptLine[] = []
  for (const match of xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    // Text arrives escaped twice; formatting tags such as <i> are dropped.
    const text = decodeEntities(decodeEntities(match[3])).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    const start = Number(match[1])
    if (text) lines.push({ text, start, end: start + Number(match[2] ?? 0) })
  }
  return lines.length ? lines : undefined
}
