// Inlines the real Duet mascot engine (components/duet) into the flashcards design, between its
// <!--DUET--> markers. Run again after the engine changes:
//   node design-preview/cards/build.mjs
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const page = resolve(here, '../../../docs/design/cards/duet-flashcards.html')
const out = await build({
  entryPoints: [resolve(here, 'duet-entry.ts')],
  bundle: true, format: 'iife', minify: true, write: false, outdir: here, target: 'es2022'
})
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/g, '<\/script')
const css = out.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
const html = readFileSync(page, 'utf8')
const block = `<!--DUET--><style>${css}</style><script>${js}</script><!--/DUET-->`
const next = html.includes('<!--DUET-->')
  ? html.replace(/<!--DUET-->[\s\S]*?<!--\/DUET-->/, () => block)
  : html.replace('<script>', () => `${block}\n<script>`)
writeFileSync(page, next)
console.log('inlined Duet engine', (block.length / 1024).toFixed(0) + ' KB')
