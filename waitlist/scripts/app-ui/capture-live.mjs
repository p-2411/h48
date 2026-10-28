// Captures one piece of the running app (not the design preview) into waitlist/src/app-ui.json, for
// the pieces only the real app draws: the strip while talking, the side panel on Explain, Home's bar.
// Run Duet with its windows inspectable (docs/handover/landing-film.md), bring the piece on screen,
// then:  node waitlist/scripts/app-ui/capture-live.mjs <name> <group> <window url part> <selector>
//   e.g. node waitlist/scripts/app-ui/capture-live.mjs dock-talk overlay index.html .dock
// The piece's rules (light and dark, when its window has a theme) are added to its group's
// stylesheet after the rules already there; capture.mjs rebuilds the file without these pieces.
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const [name, group, match, selector] = process.argv.slice(2)
if (!selector) { console.error('usage: capture-live.mjs <name> <group> <window url part> <selector>'); process.exit(1) }
const OUT = fileURLToPath(new URL('../../src/app-ui.json', import.meta.url))
const SNAP = readFileSync(new URL('./snap.js', import.meta.url), 'utf8')

const pages = (await (await fetch('http://127.0.0.1:9222/json/list')).json()).filter((t) => t.type === 'page')
const target = pages.find((t) => t.url.includes(match))
if (!target) { console.error('no window matches', match, pages.map((t) => t.url)); process.exit(1) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const waiting = new Map()
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) } }
const send = (method, params = {}) => new Promise((done) => { const n = ++id; waiting.set(n, done); ws.send(JSON.stringify({ id: n, method, params })) })
await new Promise((ok) => (ws.onopen = ok))
// As capture.mjs's take(): the piece now, plus the other theme's rules.
const take = `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return null
  const piece = window.__snap(el)
  const themed = document.querySelector('.theme-light, .theme-dark')
  if (themed) {
    const was = themed.classList.contains('theme-light') ? 'theme-light' : 'theme-dark'
    const other = was === 'theme-light' ? 'theme-dark' : 'theme-light'
    themed.classList.replace(was, other)
    const flipped = window.__snap(el)
    themed.classList.replace(other, was)
    const seen = new Map(piece.css.map((x) => [x[1], x[0]]))
    flipped.css.forEach((x) => { if (!seen.has(x[1])) seen.set(x[1], x[0]) })
    piece.css = [...seen].map(([t, o]) => [o, t])
  }
  return JSON.stringify(piece)
})()`
// snap.js in a scope of its own, so a second capture from the same window doesn't redeclare it.
const r = await send('Runtime.evaluate', { expression: '(function () {\n' + SNAP + '\n})();' + take, returnByValue: true })
ws.close()
if (r.result.exceptionDetails) { console.error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); process.exit(1) }
if (!r.result.result.value) { console.error('MISSING', selector); process.exit(1) }
const { css, ...piece } = JSON.parse(r.result.result.value)

const ui = JSON.parse(readFileSync(OUT, 'utf8'))
const have = new Set((ui.css[group] ?? '').split('\n'))
const added = css.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, t]) => t).filter((t) => !have.has(t))
ui.css[group] = [ui.css[group], ...added].filter(Boolean).join('\n')
ui.parts[name] = { group, ...piece }
writeFileSync(OUT, JSON.stringify(ui))
console.log(name, Math.round(piece.width) + 'x' + Math.round(piece.height), css.length + ' rules (' + added.length + ' new to ' + group + ')', (piece.html.length / 1024).toFixed(1) + 'KB')
