// Runs in the YouTube page. Reads the <video> element itself, which is always current, unlike the
// seek bar the Duet app can see from outside (YouTube stops updating it while the controls are
// hidden). Reports to the app, through background.js:
// - at once on every play, pause, seek, speed change, stall and ad;
// - and every HEARTBEAT_MS besides, so the app knows the link is alive.
// Carries out the app's pause, play and seek (the tutor holding the video, Replay).
'use strict'

const HEARTBEAT_MS = 500
const EVENTS = ['play', 'playing', 'pause', 'seeking', 'seeked', 'ratechange', 'waiting', 'stalled', 'ended', 'loadedmetadata', 'emptied']

let port
let video
let reconnectTimer

function connect() {
  clearTimeout(reconnectTimer)
  try {
    port = chrome.runtime.connect({ name: 'duet-page' })
  } catch {
    // The extension was reloaded or removed: this page's script is orphaned and stops.
    port = undefined
    return
  }
  port.onMessage.addListener(onCommand)
  port.onDisconnect.addListener(() => {
    port = undefined
    // The service worker restarted: connect again shortly.
    reconnectTimer = setTimeout(connect, 1000)
  })
  report()
}

/** The page's main video, which YouTube can swap out (navigation, Shorts, miniplayer). */
function currentVideo() {
  return document.querySelector('video.html5-main-video') || document.querySelector('#shorts-player video') || document.querySelector('video')
}

function follow() {
  const found = currentVideo()
  if (found === video) return
  for (const name of EVENTS) video?.removeEventListener(name, report)
  video = found
  for (const name of EVENTS) video?.addEventListener(name, report)
  report()
}

function adShowing() {
  return !!document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')
}

function report() {
  // Hidden pages report too: Chrome counts a window covered by others as hidden, and the app only
  // uses reports for the video it sees open (matched by the video's id).
  if (!port || !video) return
  // Moving only while it plays with data to play: a stalled or seeking video stands still.
  const playing = !video.paused && !video.ended && !video.seeking && video.readyState >= 3
  try {
    port.postMessage({
      type: 'time',
      url: location.href,
      t: video.currentTime,
      playing,
      rate: video.playbackRate,
      ad: adShowing(),
      at: Date.now()
    })
  } catch {
    port = undefined
  }
}

function onCommand(command) {
  const target = video || currentVideo()
  if (!target || !command) return
  if (command.type === 'pause') target.pause()
  else if (command.type === 'play') void target.play().catch(() => {})
  else if (command.type === 'seek' && typeof command.seconds === 'number') {
    target.currentTime = Math.max(0, command.seconds)
    if (command.play) void target.play().catch(() => {})
  }
  report()
}

document.addEventListener('visibilitychange', report)
// YouTube changes pages without reloading: look for the video again on its navigation and often.
document.addEventListener('yt-navigate-finish', follow)
setInterval(() => {
  follow()
  report()
}, HEARTBEAT_MS)
connect()
follow()
