// Makes the link-preview card (app/og.png) from the page's own hero: Duet awake above the promise,
// the brand in the corners. With the waitlist dev server on :4322 and playwright-core available:
//   node waitlist/scripts/og.mjs out.png dark   then scale to 1200x630 (sips -z 630 1200).
import { chromium } from 'playwright-core'
const [out, scheme = 'light'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'no-preference' })
await page.goto('http://localhost:4322/')
await page.addStyleTag({ content: `
  .topbar, .lede, .join, .meta, .dock, .click-me, .skip, [data-sec="video"], #how, .closing, footer { display: none !important }
  .hero { padding: 0 !important; height: 630px; box-sizing: border-box; justify-content: center }
  .hero h1 { margin-top: 30px !important; font-size: 76px !important }
  .og-corner { position: absolute; top: 34px; z-index: 30; font: 600 22px Inter, system-ui, sans-serif; color: var(--ink); display: flex; align-items: center; gap: 10px }
  .og-corner img { width: 48px; height: 48px; margin: -10px -6px }
  .og-corner.right { right: 44px; font-weight: 500; font-size: 18px; color: var(--sub) }
  .og-corner.left { left: 44px }` })
await page.evaluate(() => {
  const page = document.getElementById('page')
  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  page.insertAdjacentHTML('beforeend', `<div class="og-corner left"><img src="./a/mark-${dark ? 'dark' : 'light'}.svg" alt="">Duet</div><div class="og-corner right">useduet.io</div>`)
  scrollTo(0, 0)
})
// Awake: it sleeps while the page loads, then wakes and settles into idle.
await page.waitForTimeout(6000)
await page.mouse.move(600, 600)
await page.waitForTimeout(800)
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } })
await browser.close()
