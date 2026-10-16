// Captures the app's real UI for the landing page (waitlist/src/app-ui.json): each piece's markup,
// the CSS rules it uses (light and dark, in the app's cascade order), its ancestors' classes and its
// size, from the app's design preview. Then `npm run build:page` puts the pieces the page names on it.
//   1. Start the design preview: npx vite --config app/design-preview/vite.config.mjs  (port 5199)
//   2. With playwright-core available (npm i --no-save playwright-core in waitlist/; it uses the
//      Chromium Playwright has cached):  node waitlist/scripts/app-ui/capture.mjs
// It drives the app as of ui-fixes (669159f): a checkpoint opens with one click on the glowing strip.
// Deliberate differences from the app are made here, each commented where it's done.
import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
const OUT = process.argv[2] || fileURLToPath(new URL('../../src/app-ui.json', import.meta.url))
const SNAP = readFileSync(new URL('./snap.js', import.meta.url), 'utf8')
// The design preview (vite) and the app folder it serves.
const BASE = process.env.HARNESS || 'http://localhost:5199'
const APP = process.env.APP_DIR || fileURLToPath(new URL('../../../app', import.meta.url)).replace(/\/$/, '')
const CAPTION = BASE + '/@fs' + APP + '/design-preview/caption-live/index.html'
const browser = await chromium.launch()
const parts = {}
// SHOTS=<folder> also saves a screenshot of each piece as the app draws it, to compare.
const shots = process.env.SHOTS

async function open(url, width = 1440, before, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('pageerror', (e) => console.log('  pageerror', e.message.slice(0, 120)))
  if (before) await page.addInitScript(before)
  await page.goto(url)
  await page.waitForTimeout(2500)
  await page.addScriptTag({ content: SNAP })
  return page
}
const click = (page, text) => page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t || b.getAttribute('aria-label') === t).click(), text)
// One piece, light and dark: the markup as it is now, CSS from both themes.
async function take(page, name, group, find, shadow = false) {
  const data = await page.evaluate(({ find, shadow }) => {
    const root = shadow ? document.getElementById('host').shadowRoot : document
    const el = root.querySelector(find)
    if (!el) return null
    const light = window.__snap(el)
    const themed = document.querySelector('.theme-light')
    if (themed) { themed.classList.replace('theme-light', 'theme-dark'); const dark = window.__snap(el); themed.classList.replace('theme-dark', 'theme-light'); const seen = new Map(light.css.map((x) => [x[1], x[0]])); dark.css.forEach((x) => { if (!seen.has(x[1])) seen.set(x[1], x[0]) }); light.css = [...seen].map(([t, o]) => [o, t]) }
    return light
  }, { find, shadow })
  if (!data) { console.log('MISSING', name, find); return }
  parts[name] = { group, ...data }
  console.log(name, Math.round(data.width) + 'x' + Math.round(data.height), data.css.length + ' rules', (data.html.length / 1024).toFixed(1) + 'KB')
  if (shots) {
    const loc = shadow ? page.locator('#host').locator(find).first() : page.locator(find).first()
    await loc.screenshot({ path: `${shots}/${name}.png` }).catch((e) => console.log('  shot failed', e.message.slice(0, 80)))
  }
}

// The caption window (Overlay.tsx), driven by the stand-in.
{
  const page = await open(CAPTION)
  const run = (fn, arg) => page.evaluate(fn, arg)
  for (const lv of [1, 3, 5]) {
    await run((lv) => { demo.setLevel(lv); demo.showLine(true) }, lv)
    await page.waitForTimeout(1000)
    await take(page, 'strip-l' + lv, 'overlay', '.strip-row', true)
  }
  await run(() => { demo.setLevel(3); demo.showLine(true) })
  await page.waitForTimeout(1000)
  await take(page, 'dock-l3', 'overlay', '.dock', true)
  // A word card: the pointer on "compró".
  const box = await run(() => { const w = [...document.getElementById('host').shadowRoot.querySelectorAll('.line .w')].find((w) => w.textContent === 'compró').getBoundingClientRect(); return { x: w.x + w.width / 2, y: w.y + w.height / 2 } })
  await page.mouse.move(box.x, box.y)
  await page.waitForTimeout(1200)
  await take(page, 'dock-card', 'overlay', '.dock', true)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(800)
  // A checkpoint: offered (the strip glows), opened with a click, answered.
  await run(() => demo.offer())
  await page.waitForTimeout(1500)
  await take(page, 'dock-glow', 'overlay', '.dock', true)
  await run(() => { const s = document.getElementById('host').shadowRoot.querySelector('.strip'); const r = s.getBoundingClientRect(); const o = { bubbles: true, composed: true, clientX: r.left + 6, clientY: r.top + r.height / 2, detail: 1, pointerId: 1 }; s.dispatchEvent(new PointerEvent('pointerdown', o)); s.dispatchEvent(new MouseEvent('click', o)) })
  await page.waitForTimeout(1800)
  await take(page, 'dock-ask', 'overlay', '.dock', true)
  await page.locator('#host').locator('.challenge-answer input').fill('She bought a new car')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1800)
  await page.mouse.move(5, 5)
  await take(page, 'dock-done', 'overlay', '.dock', true)
  await page.close()
}

// The home window: its tiles, the flashcard review, Talk.
const VOICE = '/@fs' + APP + '/design-preview/inject-voice.tsx'
const VOICE_CSS = `.bubble.voice-note { flex-direction: row; align-items: center; gap: 10px; padding: 8px 14px 8px 8px }
.voice-note .vn-play { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, currentColor 16%, transparent) }
.voice-note .vn-play svg { margin-left: 2px }
.voice-note .vn-wave { display: flex; align-items: center; gap: 2px; height: 24px }
.voice-note .vn-wave i { width: 3px; border-radius: 2px; background: currentColor; opacity: 0.85 }
.voice-note .vn-time { font-size: 12px; opacity: 0.7; font-variant-numeric: tabular-nums }
.turn-foot .vn-said { font-style: italic }`
const TALK = `window.addEventListener('DOMContentLoaded', () => { handlers['talk.open'] = () => Promise.resolve({ state: 'idle', chat: [
  { from: 'learner', text: 'Mañana tengo que madrugar.', via: 'voice' },
  { from: 'duet', text: '¡Perfecto! That sentence is exactly right. One small thing: the r in madrugar is one quick tap, like the tt in “butter”.', via: 'text' },
  { from: 'learner', text: '¿Cómo se dice “I overslept”?', via: 'voice' },
  { from: 'duet', text: 'Me quedé dormido. Word for word it’s “I stayed asleep”. Want to try it out loud?', via: 'text' }
] }) })`
{
  const page = await open(BASE + '/home.html')
  // Not on the page: the Today tile's line under the greeting.
  await page.evaluate(() => [...document.querySelectorAll('.tile-today p.muted')].filter((p) => p.textContent.startsWith('Five minutes with the words')).forEach((p) => p.remove()))
  await take(page, 'tile-today', 'home', 'section.tile-today')
  await take(page, 'tile-watching', 'home', 'section.tile-watching')
  await take(page, 'tile-words', 'home', 'section.tile-words')
  await click(page, 'Review 14'); await page.waitForTimeout(1200)
  await click(page, 'Start'); await page.waitForTimeout(1200)
  await click(page, 'OK'); await page.waitForTimeout(600)
  await take(page, 'card-front', 'home', '.fc-deck')
  await click(page, 'Show the answer'); await page.waitForTimeout(1000)
  await take(page, 'card-back', 'home', '.fc-deck')
  await page.close()
}
{
  const page = await open(BASE + '/home.html', 760, TALK, 600)
  await click(page, 'Talk to Duet'); await page.waitForTimeout(2000)
  // Talking, not typing: the real voice bar in place of the message box, and the learner's turns as
  // voice messages (a design for the landing page: a waveform bubble, its words under it).
  await page.evaluate(async (path) => { const m = await import(path); await m.injectVoiceBar(document.querySelector('.home-talk .composer')) }, VOICE)
  await page.evaluate((css) => {
    const style = document.createElement('style'); style.setAttribute('data-vite-dev-id', 'landing-voice-note'); style.textContent = css; document.head.appendChild(style)
    const heights = [6, 10, 15, 9, 18, 22, 14, 8, 12, 19, 16, 10, 7, 13, 20, 17, 11, 8, 14, 9, 6, 11, 8, 5]
    document.querySelectorAll('.home-talk .turn.learner').forEach((turn, n) => {
      const bubble = turn.querySelector('.bubble'), text = bubble.querySelector('.turn-text').textContent
      bubble.classList.add('voice-note')
      bubble.innerHTML = '<span class="sr-only">You, by voice: ' + text + '</span><span class="vn-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="11" height="11"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg></span><span class="vn-wave" aria-hidden="true">' + heights.map((h, i) => '<i style="height:' + Math.max(4, Math.round(h * (n ? 0.85 : 1))) + 'px"></i>').join('') + '</span><span class="vn-time" aria-hidden="true">0:0' + (n ? 2 : 3) + '</span>'
      const foot = turn.querySelector('.turn-foot span'); if (foot) { foot.textContent = '“' + text + '”'; foot.classList.add('vn-said') }
    })
  }, VOICE_CSS)
  // The pronunciation check is leaving the app: not on the page.
  await page.evaluate(() => [...document.querySelectorAll('.voice-bar button')].filter((b) => b.textContent.trim() === 'Check my pronunciation').forEach((b) => b.remove()))
  await page.waitForTimeout(400)
  await take(page, 'talk', 'home', 'main.home-talk')
  await page.close()
}
// The side panel on Explain, at a side panel's width.
{
  const page = await open(BASE + '/panel.html', 460)
  await take(page, 'explain', 'panel', 'article.entry')
  await page.close()
}
await browser.close()

// One stylesheet per window (rules shared by its pieces), the pieces without their CSS.
// Rules keep the app's own cascade order (a piece's rules interleave with another's).
const groups = {}
for (const p of Object.values(parts)) { const g = (groups[p.group] ??= new Map()); p.css.forEach(([o, t]) => { if (!g.has(t) || o < g.get(t)) g.set(t, o) }) }
// Pictures from other services (the sample's YouTube thumbnails) become the site's own.
let thumb = 0
for (const p of Object.values(parts)) p.html = p.html.replace(/https:\/\/i\.ytimg\.com\/[^"']+/g, () => `./a/thumb-${(thumb++ % 2) + 1}.jpg`)
const out = { css: Object.fromEntries(Object.entries(groups).map(([g, m]) => [g, [...m].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([t]) => t).join('\n')])), parts: Object.fromEntries(Object.entries(parts).map(([k, { css, ...rest }]) => [k, rest])) }
writeFileSync(OUT, JSON.stringify(out))
console.log('css', Object.fromEntries(Object.entries(out.css).map(([g, c]) => [g, (c.length / 1024).toFixed(0) + 'KB'])))
