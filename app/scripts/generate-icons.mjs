// Draws every Duet icon file from one definition of the mark: the macOS .icns, the Windows .ico,
// the PNGs Electron and Linux use, the tray icons, the SVG masters and the website favicon.
// Run with `npm run icons`. It runs inside Electron so Chromium can rasterise the SVGs; nothing
// else needs installing.
//
// Two colourways are locked: Mono light (the app icon) and Sea Ink (dark). The mark itself is
// defined once, in duet-mark.mjs.

import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PALETTES, ROUNDED, SQUIRCLE, face, faceShapes, tile } from './duet-mark.mjs'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = join(appDir, '..')

const svg = (inner, viewBox = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`

// The macOS icon on Apple's grid: an 824 px body centred in a 1024 px canvas, with a soft shadow.
const macIcon = (c, small) => svg(
  `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter></defs>` +
  `<g filter="url(#s)" transform="translate(100 100) scale(8.24)">${tile(c, { shape: SQUIRCLE, small })}</g>`,
  '0 0 1024 1024'
)
const winIcon = (c, small) => svg(tile(c, { shape: ROUNDED, small }))
const bareMark = (c) => svg(face(c))

// macOS menu bar template: one colour plus transparency, pupils cut out of the eyes.
const trayTemplate = () => {
  const m = face({ eyeL: '#fff', eyeR: '#fff', pupil: '#000', mouth: '#fff' }, { small: true })
  return svg(`<defs><mask id="m">${m}</mask></defs><rect width="100" height="100" fill="#000" mask="url(#m)"/>`)
}

// Website favicon: follows the browser's light or dark setting. Drawn with stand-in colours that are
// then swapped for classes, since CSS variables aren't reliable inside SVG presentation attributes.
const favicon = () => {
  const L = PALETTES.light, D = PALETTES.dark
  const stand = { bg: '#000001', eyeL: '#000002', eyeR: '#000002', pupil: '#000001', mouth: '#000003', rim: ['#000002', 0.08, 1.2] }
  const body = tile(stand, { shape: ROUNDED, small: true })
    .replaceAll('fill="#000001"', 'class="b"').replaceAll('fill="#000002"', 'class="e"')
    .replaceAll('fill="#000003"', 'class="m"').replaceAll('stroke="#000002"', 'class="r"')
  const css = (c) => `.b{fill:${c.bg}}.e{fill:${c.eyeL}}.m{fill:${c.mouth}}.r{stroke:${c.eyeL}}`
  return svg(`<style>${css(L)}@media (prefers-color-scheme:dark){${css(D)}}</style>${body}`)
}

// Icon Composer layers for macOS 26: full-bleed 1024 canvas, no tile (the background is set in
// Icon Composer), so the system can render the glass and the light, dark and tinted looks.
const layer = (c, part) => svg(`<g transform="scale(10.24)">${faceShapes(c).filter((s) => s.part === part).map((s) => `<path d="${s.d}" fill="${s.fill}"/>`).join('')}</g>`, '0 0 1024 1024')

// ---------- Containers ----------

function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
  let offset = head.length
  entries.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1)
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6)
    head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...entries.map((e) => e.png)])
}

function icns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii'); h.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([h, png])
  })
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii'); h.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4)
  return Buffer.concat([h, ...chunks])
}

// ---------- Rasterise in Chromium ----------

async function makeRasteriser() {
  const win = new BrowserWindow({ show: false, width: 200, height: 200 })
  await win.loadURL('about:blank')
  return async (svgText, size, { opaque = null } = {}) => {
    const b64 = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image()
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svgText).toString('base64'))}
      await img.decode()
      const c = document.createElement('canvas'); c.width = c.height = ${size}
      const g = c.getContext('2d')
      ${opaque ? `g.fillStyle = ${JSON.stringify(opaque)}; g.fillRect(0, 0, ${size}, ${size})` : ''}
      g.drawImage(img, 0, 0, ${size}, ${size})
      return c.toDataURL('image/png').split(',')[1]
    })()`)
    return Buffer.from(b64, 'base64')
  }
}

function write(path, data) {
  const full = join(appDir, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, data)
  console.log('  ' + path)
}

app.whenReady().then(async () => {
  const png = await makeRasteriser()
  const L = PALETTES.light, D = PALETTES.dark
  const SMALL = 32 // at this size and below, use the small-size artwork

  console.log('Writing Duet icons:')

  // macOS app icon (Mono light). Types per Apple's icns format; the @2x types show at half their pixel size.
  const mac = (px, pt) => png(macIcon(L, pt <= SMALL), px)
  write('build/icon.icns', icns([
    { type: 'icp4', png: await mac(16, 16) }, { type: 'ic11', png: await mac(32, 16) },
    { type: 'icp5', png: await mac(32, 32) }, { type: 'ic12', png: await mac(64, 32) },
    { type: 'ic07', png: await mac(128, 128) }, { type: 'ic13', png: await mac(256, 128) },
    { type: 'ic08', png: await mac(256, 256) }, { type: 'ic14', png: await mac(512, 256) },
    { type: 'ic09', png: await mac(512, 512) }, { type: 'ic10', png: await mac(1024, 512) }
  ]))

  // Windows app icon (Mono light), with every size the shell asks for.
  const winSizes = [16, 20, 24, 32, 40, 48, 64, 256]
  write('build/icon.ico', ico(await Promise.all(winSizes.map(async (size) => ({ size, png: await png(winIcon(L, size <= SMALL), size) })))))

  // Linux, and the PNG Electron uses for the dev dock icon.
  write('build/icon.png', await png(winIcon(L, false), 512))
  write('resources/icon.png', await png(macIcon(L, false), 512))

  // Tray: a template for the macOS menu bar, the small tile for the Windows notification area.
  write('resources/trayTemplate.png', await png(trayTemplate(), 18))
  write('resources/trayTemplate@2x.png', await png(trayTemplate(), 36))
  write('resources/tray.png', await png(winIcon(L, true), 16))
  write('resources/tray@2x.png', await png(winIcon(L, true), 32))

  // SVG masters, plus large PNGs of both colourways for the website, decks and stores.
  for (const [name, c] of [['light', L], ['dark', D]]) {
    // Runtime variants: the taskbar/Dock/tray can follow system appearance without
    // changing the packaged executable's canonical Mono light icon.
    write(`resources/icon-${name}.ico`, ico(await Promise.all(winSizes.map(async (size) => ({ size, png: await png(winIcon(c, size <= SMALL), size) })))))
    write(`resources/icon-${name}.png`, await png(winIcon(c, false), 512))
    write(`resources/dock-${name}.png`, await png(macIcon(c, false), 512))
    write(`resources/tray-${name}.png`, await png(winIcon(c, true), 16))
    write(`resources/tray-${name}@2x.png`, await png(winIcon(c, true), 32))
    write(`build/icon-source/duet-macos-${name}.svg`, macIcon(c, false))
    write(`build/icon-source/duet-macos-${name}-small.svg`, macIcon(c, true))
    write(`build/icon-source/duet-windows-${name}.svg`, winIcon(c, false))
    write(`build/icon-source/duet-windows-${name}-small.svg`, winIcon(c, true))
    write(`build/icon-source/duet-mark-${name}.svg`, bareMark(c))
    write(`build/icon-source/duet-macos-${name}-1024.png`, await png(macIcon(c, false), 1024))
    write(`build/icon-source/icon-composer/${name}-eyes.svg`, layer(c, 'eyes'))
    write(`build/icon-source/icon-composer/${name}-features.svg`, layer(c, 'features'))
  }

  // Website: a favicon that follows light and dark, and the iOS home-screen icon (opaque, full bleed;
  // iOS rounds the corners itself).
  const touch = svg(`<rect width="100" height="100" fill="${L.bg}"/>${face(L, { scale: 1.04 })}`)
  writeFileSync(join(repoDir, 'waitlist/app/favicon.svg'), favicon()); console.log('  ../waitlist/app/favicon.svg')
  writeFileSync(join(repoDir, 'waitlist/app/apple-touch-icon.png'), await png(touch, 180, { opaque: L.bg })); console.log('  ../waitlist/app/apple-touch-icon.png')

  app.quit()
})
