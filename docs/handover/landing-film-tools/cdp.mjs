// Looks at Duet's windows through the DevTools protocol (Duet started with --remoteDebuggingPort 9222).
//   node cdp.mjs list                         the windows
//   node cdp.mjs shot <match> <out.png>       a screenshot of the first window whose url matches
//   node cdp.mjs eval <match> "<js>"          runs JS in that window, prints the result
//   node cdp.mjs mouse <match> <type> <x> <y> a mouse event (moved | pressed | released) at x,y
//   node cdp.mjs wheel <match> <x> <y> <dx> <dy>
import { writeFileSync } from 'fs'
const [cmd, match, ...rest] = process.argv.slice(2)
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const pages = targets.filter((t) => t.type === 'page')
if (cmd === 'list') {
  for (const t of pages) console.log(t.id, t.title, t.url)
  process.exit(0)
}
const target = pages.find((t) => t.url.includes(match))
if (!target) { console.error('no window matches', match, pages.map((t) => t.url)); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const waiting = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) } }
const send = (method, params = {}) => new Promise((done) => { const n = ++id; waiting.set(n, done); ws.send(JSON.stringify({ id: n, method, params })) })
await new Promise((ok) => (ws.onopen = ok))
if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(rest[0], Buffer.from(r.result.data, 'base64'))
  console.log('saved', rest[0])
} else if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: rest[0], awaitPromise: true, returnByValue: true })
  console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1))
} else if (cmd === 'mouse') {
  const [type, x, y] = rest
  await send('Input.dispatchMouseEvent', { type: type === 'moved' ? 'mouseMoved' : type === 'pressed' ? 'mousePressed' : 'mouseReleased', x: +x, y: +y, button: type === 'moved' ? 'none' : 'left', clickCount: 1 })
  console.log('ok')
} else if (cmd === 'wheel') {
  const [x, y, dx, dy] = rest
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +x, y: +y, deltaX: +dx, deltaY: +dy })
  console.log('ok')
}
ws.close()
