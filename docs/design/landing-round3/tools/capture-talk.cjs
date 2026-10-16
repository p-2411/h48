// Captures the app's Talk page with a short practice conversation, for "Practice with Duet": the
// learner says a line, Duet gives one pronunciation note, the retry lands, and Duet offers to save a
// card. Runs off the design preview (npm run in app/: the "home-design" server, http://localhost:5199).
//   app/node_modules/.bin/electron docs/design/landing-round3/tools/capture-talk.cjs
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../../..')
const OUT = path.resolve(__dirname, '../a')
const BASE = 'http://localhost:5199'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chat = [
  { from: 'learner', via: 'voice', text: 'Mañana tengo que madrugar.' },
  { from: 'duet', via: 'voice', correction: true, text: 'Almost! Put the stress on the end: ma-dru-GAR. Once more: Mañana tengo que madrugar.' },
  { from: 'learner', via: 'voice', text: 'Mañana tengo que madrugar.' },
  { from: 'duet', via: 'voice', text: 'Nice, that was clear. ¿A qué hora te levantas?' }
]
const pending = {
  id: 'p1', kind: 'save-card', expiresAt: new Date(Date.now() + 3600e3).toISOString(),
  draft: { expression: 'levantarse', meaning: 'to get up', target: 'levantarse', context: ['¿A qué hora te levantas?'], source: 'tutor' }
}
const extra =
  "'talk.open': () => later(" + JSON.stringify({ chat, state: 'idle' }) + "),\n" +
  "  'tutor.onPendingAction': (cb) => { setTimeout(() => cb(" + JSON.stringify(pending) + "), 600); return off },\n"

function mock(dark) {
  let js = fs.readFileSync(path.join(ROOT, 'app/design-preview/mock-duet.js'), 'utf8')
  js = js.replace("'talk.open': () => later({chat:[],state:'idle'}),\n", extra)
  if (dark) js = js.replace("appearance: 'light', dark: false", "appearance: 'dark', dark: true")
  js = js.replace('layout: {open:[]', 'layout: {open:["talk"]')
  return js.split('Ma?ana').join('Mañana').split('d?a').join('día')
}

async function shot(name, dark) {
  const win = new BrowserWindow({ width: 1100, height: 700, show: true, x: -4000, y: 0, useContentSize: true, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } })
  const dbg = win.webContents.debugger
  dbg.attach('1.3')
  const js = mock(dark)
  dbg.on('message', (e, method, params) => {
    if (method !== 'Fetch.requestPaused') return
    dbg.sendCommand('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(js).toString('base64') }).catch(() => {})
  })
  await dbg.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*mock-duet.js*' }] })
  await win.loadURL(BASE + '/home.html')
  win.webContents.setZoomFactor(0.78)
  // Shown (off-screen), so Duet's wake-up animation runs and it's awake in the shot.
  await sleep(6500)
  // The newest turn and the card in view.
  await win.webContents.executeJavaScript("document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight })")
  await sleep(600)
  // Just the conversation column: Duet at its head down to the message bar.
  const rect = await win.webContents.executeJavaScript(`(() => {
    const head = document.querySelector('.head-slot').getBoundingClientRect()
    const field = document.querySelector('textarea, input[type=text]')
    let bar = field
    while (bar.parentElement && bar.parentElement.getBoundingClientRect().width < 900) bar = bar.parentElement
    const b = bar.getBoundingClientRect()
    const cx = head.left + head.width / 2, half = Math.round(b.width / 2) + 16
    return { x: cx - half, y: head.top - 24, width: half * 2, height: b.bottom + 16 - (head.top - 24) }
  })()`)
  // Page pixels to window pixels (the page is zoomed out).
  const z = win.webContents.getZoomFactor()
  for (const k of Object.keys(rect)) rect[k] = Math.round(rect[k] * z)
  const img = await win.webContents.capturePage(rect)
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG())
  console.log('saved', name, img.getSize())
  win.destroy()
}

app.commandLine.appendSwitch('force-device-scale-factor', '1.5')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.ytimg.com/*', '*://img.youtube.com/*'] }, (d, cb) => cb({ cancel: true }))
  for (const [name, dark] of [['talk-light', false], ['talk-dark', true]]) {
    try { await shot(name, dark) } catch (e) { console.log('failed', name, e.message) }
  }
  app.quit()
})
