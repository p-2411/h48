#!/usr/bin/env node
// A stand-in for the browser reader, for working on the overlay without a real browser: it says
// Sintel is open on YouTube and playing from 1:45, ticking the time each second, and obeys pause,
// play and seek. Run Duet with it:  DUET_READER=dev/stand-in-reader.mjs npm run dev
const url = process.env.DUET_VIDEO ?? 'https://www.youtube.com/watch?v=eRsGyueVLvQ'
let position = Number(process.env.DUET_FROM ?? 105)
let playing = true
const emit = (object) => process.stdout.write(JSON.stringify(object) + '\n')
emit({ type: 'status', trusted: true, browser: 'Google Chrome', bundle: 'com.google.Chrome', url, title: 'Sintel - YouTube', captions: true, available: true })
setInterval(() => {
  if (playing) position += 1
  emit({ type: 'time', t: Math.floor(position), playing, ad: false, url, at: Date.now() })
}, 1000)
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let at
  while ((at = buffer.indexOf('\n')) >= 0) {
    const command = JSON.parse(buffer.slice(0, at))
    buffer = buffer.slice(at + 1)
    if (command.type === 'pause') playing = false
    if (command.type === 'play') playing = true
    if (command.type === 'seek') position = command.seconds
  }
})
