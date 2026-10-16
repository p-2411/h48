// Builds the guided first-run prototype into single files: a full page for docs/design/onboarding, and the
// same page without the document skeleton, for publishing as an artifact.
//   node design-preview/first-run/build.mjs [artifact-out.html]
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const out = await build({
  entryPoints: [resolve(here, 'duet-guided.ts')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  outdir: here,
  target: 'es2022'
})
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text
const css = out.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
const page = readFileSync(resolve(here, 'duet-guided.html'), 'utf8')
  .replace('<!--CSS-->', `<style>${css}</style>`)
  .replace('<!--JS-->', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`)
writeFileSync(
  resolve(here, '../../../docs/design/onboarding/duet-guided.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${page}\n</body>\n</html>\n`
)
if (process.argv[2]) writeFileSync(process.argv[2], page)
console.log('built', (page.length / 1024).toFixed(0) + ' KB')
