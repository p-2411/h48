// Builds the merged first-run prototype into single files: a full page for docs/design/onboarding, and the
// same page without the document skeleton, for publishing as an artifact.
//   node design-preview/duet-merged/build.mjs [artifact-out.html]
// Two passes: the app's caption window (real-overlay.tsx) first, for its CSS alone, which goes into
// that window's shadow root; then the page, where CSS from the app's code is left out so it can't
// touch the page (only the mascot's own duet.css, imported by the page, is kept).
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const common = {
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  outdir: here,
  target: 'es2022',
  jsx: 'automatic',
  // The app's CSS: its grain textures inline; its font files left out (the page loads the same
  // fonts, and @font-face inside a shadow root wouldn't apply anyway).
  loader: { '.svg': 'dataurl', '.ttf': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' }
}

const overlay = await build({ ...common, entryPoints: [resolve(here, 'real-overlay.tsx')] })
const overlayCss = overlay.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''

const page = await build({
  ...common,
  entryPoints: [resolve(here, 'duet-merged.ts')],
  define: { ...common.define, __OVERLAY_CSS__: JSON.stringify(overlayCss) },
  plugins: [
    {
      name: 'app-css-in-shadow-only',
      setup(b) {
        b.onLoad({ filter: /\.css$/ }, (args) => {
          // The page's own CSS import (the mascot) stays; the app's goes into the shadow root.
          const mine = args.path.replace(/\\/g, '/').endsWith('components/duet/duet.css')
          return mine ? undefined : { contents: '', loader: 'css' }
        })
      }
    }
  ]
})
const js = page.outputFiles.find((f) => f.path.endsWith('.js')).text
const css = page.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? ''
const html = readFileSync(resolve(here, 'duet-merged.html'), 'utf8')
  .replace('<!--CSS-->', `<style>${css}</style>`)
  .replace('<!--JS-->', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`)
writeFileSync(
  resolve(here, '../../../docs/design/onboarding/duet-merged.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}\n</body>\n</html>\n`
)
if (process.argv[2]) writeFileSync(process.argv[2], html)
console.log('built', (html.length / 1024).toFixed(0) + ' KB', '· caption window CSS', (overlayCss.length / 1024).toFixed(0) + ' KB')
