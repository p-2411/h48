// Captures the locked flashcard design (docs/design/cards/duet-cards.html): the sentence card's
// front and back for madrugar, light and dark, at 1.5x, for the landing page.
//   electron capture/cards.cjs <outDir>
const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('fs')
const path = require('path')
const out = process.argv[process.argv.length - 1]
const URL = 'http://localhost:5310/ref/cards.html'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(theme) {
  const win = new BrowserWindow({ width: 1100, height: 700, show: false, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } })
  nativeTheme.themeSource = theme
  await win.loadURL(URL)
  win.webContents.setZoomFactor(1)
  await sleep(1500)
  for (const [i, face] of [[1, 'front'], [2, 'back']]) {
    const r = await win.webContents.executeJavaScript(`(() => { const e = document.querySelectorAll('.card')[${i}]; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) } })()`)
    await sleep(400)
    const r2 = await win.webContents.executeJavaScript(`(() => { const b = document.querySelectorAll('.card')[${i}].getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) } })()`)
    const img = await win.webContents.capturePage(r2)
    fs.writeFileSync(path.join(out, `card-${face}-${theme}.png`), img.toPNG())
    console.log('saved', face, theme, img.getSize().width + 'x' + img.getSize().height, JSON.stringify(r))
  }
  win.destroy()
}

app.commandLine.appendSwitch('force-device-scale-factor', '1.5')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  for (const t of ['light', 'dark']) { try { await shot(t) } catch (e) { console.log('failed', t, e.message) } }
  app.quit()
})
