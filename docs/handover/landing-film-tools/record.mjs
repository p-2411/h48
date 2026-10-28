// Records the landing page's film in a headless browser at real speed: scrolls the film into view,
// then saves a frame of it every STEP ms, as <out>/f-<ms>.jpg. Start the browser first, e.g.
//   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<a scratch folder> about:blank
// and serve waitlist/app on port 4322 (the waitlist-static launch config).
//   node record.mjs <out dir> [seconds] [step ms] [width] [theme light|dark]
// sheet.ps1.txt tiles the frames into contact sheets: powershell -File sheet.ps1 -dir <out dir>
import { mkdirSync, writeFileSync } from 'fs'
const [out, seconds = '36', step = '500', width = '1280', theme = 'dark'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const waiting = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) } }
const send = (method, params = {}) => new Promise((done) => { const n = ++id; waiting.set(n, done); ws.send(JSON.stringify({ id: n, method, params })) })
await new Promise((ok) => (ws.onopen = ok))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: Math.round(+width * 0.66), deviceScaleFactor: 1, mobile: +width < 600 })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:4322/' })
await wait(2500)
await evaluate(`(() => { const f = document.getElementById('film'); window.scrollTo({ top: f.getBoundingClientRect().top + scrollY - Math.max(0, (innerHeight - f.offsetHeight) / 2), behavior: 'instant' }); })()`)
const t0 = Date.now()
const box = await evaluate(`(() => { const b = document.getElementById('film').getBoundingClientRect(); return { x: b.x + scrollX, y: b.y + scrollY, width: b.width, height: b.height } })()`)
for (let ms = 0; ms <= +seconds * 1000; ms += +step) {
  const ahead = t0 + ms - Date.now()
  if (ahead > 0) await wait(ahead)
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80, clip: { ...box, scale: 1 } })
  writeFileSync(`${out}/f-${String(ms).padStart(5, '0')}.jpg`, Buffer.from(r.result.data, 'base64'))
}
console.log('frames in', out, JSON.stringify(box))
ws.close()
