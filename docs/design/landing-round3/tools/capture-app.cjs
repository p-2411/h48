// Captures the real app screens from the design preview (http://localhost:5199) as 2x PNGs for the
// landing page: the home window, its pages, the caption window and the onboarding.
//   electron capture/main.cjs <outDir>
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const out = process.argv[process.argv.length - 1]
const BASE = 'http://localhost:5199'
const CAPTION = BASE + '/@fs/C:/Users/Rohith/h48/app/design-preview/caption-live/index.html'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Each shot: page, window size, steps before the capture, and what to crop to (a selector, or the
// whole window).
const shots = [
  { name: 'home-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: [] } },
  { name: 'today-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: ['today'] } },
  { name: 'watching-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: ['watching'] } },
  { name: 'words-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: ['words'] } },
  { name: 'talk-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: ['talk'] } },
  { name: 'home-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: [] } },
  { name: 'today-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: ['today'] } },
  { name: 'watching-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: ['watching'] } },
  { name: 'words-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: ['words'] } },
  { name: 'talk-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: ['talk'] } },
  { name: 'caption-rest', url: CAPTION, w: 1100, h: 700, crop: '.video', steps: [['still'], ['wait', 1500]] },
  { name: 'caption-word', url: CAPTION, w: 1100, h: 700, crop: '.video', steps: [['still'], ['wait', 1500], ['hoverShadow', '#host', '.w.live:nth-of-type(3)'], ['wait', 900]] },
  { name: 'caption-check', url: CAPTION, w: 1100, h: 700, crop: '.video', steps: [['still'], ['wait', 1500], ['js', 'window.demo.offer()'], ['wait', 600], ['hoverShadow', '#host', '.dot'], ['wait', 2600]] },
  { name: 'caption-level5', url: CAPTION, w: 1100, h: 700, crop: '.video', steps: [['still'], ['wait', 1200], ['js', 'window.demo.setLevel(5)'], ['wait', 1400]] },
  { name: 'cards-light', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: false, open: ['today'], noSay: true }, focus: true, steps: [['wait', 800], ['tapText', 'button', 'Show'], ['wait', 1200]] },
  { name: 'cards-dark', url: BASE + '/home.html', w: 1100, h: 700, mock: { dark: true, open: ['today'], noSay: true }, focus: true, steps: [['wait', 800], ['tapText', 'button', 'Show'], ['wait', 1200]] },
  { name: 'caption-card', url: CAPTION, w: 1100, h: 700, crop: '.video', steps: [['still'], ['wait', 1500], ['hoverShadow', '#host', '.w.live', 2], ['wait', 2500]] },
  { name: 'caption-checkpoint', url: CAPTION, w: 1100, h: 700, crop: '.video', focus: true, steps: [['still'], ['wait', 1500], ['js', 'window.demo.offer()'], ['wait', 900], ['clickShadowEdge', '#host', '.strip'], ['wait', 2200]] },
  { name: 'welcome', url: BASE + '/welcome.html', w: 1100, h: 700, steps: [['wait', 3500]] }
]

let patch = null
const MOCK = fs.readFileSync('C:/Users/Rohith/h48/app/design-preview/mock-duet.js', 'utf8')
const STILL = 'data:image/jpeg;base64,' + fs.readFileSync('C:/Users/Rohith/h48/waitlist/app/media/sintel-scene.jpg').toString('base64')
async function run(shot) {
  patch = shot.mock || null
  const win = new BrowserWindow({
    width: shot.w, height: shot.h, show: !!shot.focus, x: shot.focus ? -4000 : undefined, y: 0, useContentSize: true, enableLargerThanScreen: true, paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false }
  })
    if (patch) {
    const dbg = win.webContents.debugger
    dbg.attach('1.3')
    const js = MOCK.replace("appearance: 'light', dark: false", patch.dark ? "appearance: 'dark', dark: true" : "appearance: 'light', dark: false").replace('layout: {open:[]', 'layout: {open:' + JSON.stringify(patch.open)).replace(patch.noSay ? ",say:{original:'Mañana tengo que madrugar.',translation:'I have to get up early tomorrow.'}" : '@@none@@', '').split('Ma?ana').join('Mañana').split('d?a').join('día')
    dbg.on('message', (e, method, params) => {
      if (method !== 'Fetch.requestPaused') return
      dbg.sendCommand('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(js).toString('base64') }).catch(() => {})
    })
    await dbg.sendCommand('Fetch.enable', { patterns: [{ urlPattern: '*mock-duet.js*' }] })
  }
  win.webContents.on('console-message', (e, level, msg) => { if (process.env.ONLY) console.log('console', level, msg.slice(0, 400)) })
  for (let i = 0; ; i++) { try { await win.loadURL(shot.url); break } catch (e) { if (i > 3) throw e; await sleep(800) } }
  await sleep(shot.mock ? 4500 : 1800)
  const wc = win.webContents
  wc.setZoomFactor(1)
  await sleep(300)
  for (const [kind, a, b, c] of shot.steps || []) {
    if (kind === 'wait') await sleep(a)
    if (kind === 'js') await wc.executeJavaScript(a)
    if (kind === 'still') await wc.executeJavaScript(`(() => { const v = document.querySelector('.video'); v.style.background = 'center / cover url(' + ${JSON.stringify(STILL)} + ')'; const st = document.createElement('style'); st.textContent = '.video::before{display:none}'; document.head.append(st) })()`)
    if (kind === 'click') {
      const ok = await wc.executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(a)}); if (!e) return false; e.click(); return true })()`)
      if (!ok) console.log(shot.name, 'no element', a)
      await sleep(1400)
    }
    if (kind === 'clickText') {
      const ok = await wc.executeJavaScript(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(a)})].find(x => x.textContent.trim().startsWith(${JSON.stringify(b)})); if (!e) return false; e.click(); return true })()`)
      if (!ok) console.log(shot.name, 'no text', b)
      await sleep(1600)
    }
    if (kind === 'tapText') {
      win.focus(); wc.focus()
      const r = await wc.executeJavaScript(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(a)})].find(x => x.textContent.trim().startsWith(${JSON.stringify(b)})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
      if (!r) { console.log(shot.name, 'no text', b); continue }
      wc.sendInputEvent({ type: 'mouseMove', ...r }); await sleep(100)
      wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...r }); await sleep(60)
      wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...r })
    }
    if (kind === 'clickShadowEdge') {
      win.focus(); wc.focus()
      const r = await wc.executeJavaScript(`(() => { const h = document.querySelector(${JSON.stringify(a)}); const e = (h.shadowRoot || h).querySelector(${JSON.stringify(b)}); const r = e.getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 10 } })()`)
      const at = { x: Math.round(r.x), y: Math.round(r.y) }
      wc.sendInputEvent({ type: 'mouseMove', ...at })
      await sleep(120)
      wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...at })
      await sleep(60)
      wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...at })
    }
    if (kind === 'hoverShadow') {
      const r = await wc.executeJavaScript(`(() => { const h = document.querySelector(${JSON.stringify(a)}); const root = h.shadowRoot || h; const e = root.querySelectorAll(${JSON.stringify(b)})[${c ?? 0}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
      if (!r) { console.log(shot.name, 'no hover target', b); continue }
      for (let i = 0; i < 12; i++) {
        wc.sendInputEvent({ type: 'mouseMove', x: Math.round((r.x + i) ), y: Math.round(r.y ) })
        await sleep(120)
      }
    }
  }
  await sleep(500)
  let rect
  if (shot.crop) {
    rect = await wc.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(shot.crop)}).getBoundingClientRect(); return { x: Math.round(r.left ), y: Math.round(r.top ), width: Math.round(r.width ), height: Math.round(r.height ) } })()`)
  }
  const img = await wc.capturePage(rect)
  fs.writeFileSync(path.join(out, shot.name + '.png'), img.toPNG())
  const size = img.getSize()
  console.log('saved', shot.name, size.width + 'x' + size.height)
  win.destroy()
}

app.commandLine.appendSwitch('force-device-scale-factor', '1.5')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  // The mock data names real YouTube videos: their thumbnails are dropped (the app shows its own placeholder).
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*.ytimg.com/*', '*://img.youtube.com/*'] }, (d, cb) => cb({ cancel: true }))
  for (const shot of shots.filter((x) => !process.env.ONLY || x.name === process.env.ONLY)) {
    try { await run(shot) } catch (e) { console.log('failed', shot.name, e.message) }
  }
  app.quit()
})
