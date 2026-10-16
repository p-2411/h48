// Builds the landing page: bundles the app's mascot engine (app/src/renderer/src/components/duet)
// and inlines it into src.html, writing duet-landing.html (the page to publish; no <html>/<head>,
// the artifact host adds them) and preview.html (a full document to open locally).
//   node docs/design/landing-round3/tools/build.mjs   (after npm install in app/)
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
// esbuild comes from the app's own dependencies.
const { build } = createRequire(resolve(here, '../../../../app/package.json'))('esbuild')
const root = resolve(here, '..')
const out = await build({ entryPoints: [resolve(here, 'duet-engine-entry.ts')], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false, outdir: here })
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/g, '<\/script')
const css = out.outputFiles.find((f) => f.path.endsWith('.css')).text
const page = readFileSync(resolve(root, 'src.html'), 'utf8').replace('/*ENGINE_CSS*/', () => css).replace('//ENGINE_JS', () => js)
writeFileSync(resolve(root, 'duet-landing.html'), page)
writeFileSync(resolve(root, 'preview.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + page + '</body></html>\n')
console.log('built', (page.length / 1024).toFixed(0) + ' KB')
