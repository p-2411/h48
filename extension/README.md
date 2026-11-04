# Duet Link

A small companion extension for the Duet desktop app. It reads the YouTube player from inside the
page — the exact time, pauses, skips, rewinds and playback speed — and sends it to Duet on this
computer, so the translated lines stay in step with the video. Duet's voice tutor, strip and
translations all stay in the app; this only tells the app where the video is, and lets it pause,
play and seek the video (for the tutor and Replay).

Without it, Duet reads YouTube's seek bar from the screen, which YouTube stops updating while its
controls are hidden, so lines drift after a skip or a speed change.

## Install (Chrome, Edge, Brave)

1. Open `chrome://extensions` (`edge://extensions` in Edge).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this `extension` folder.

Duet must be running; the extension connects to it by itself (and again whenever Duet restarts).

## How it talks to Duet

`content.js` runs on YouTube and reports `{type: "time", url, t, playing, rate, ad, at}` on every
play, pause, seek, speed change and stall, and every 500 ms besides. `background.js` carries each
tab's reports over its own WebSocket to `ws://127.0.0.1:47821`, where the app listens
(`app/src/main/page-link.ts`), and carries the app's `pause` / `play` / `seek` back to the page.
The app accepts connections from browser extensions only.
