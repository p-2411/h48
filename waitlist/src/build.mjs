// Builds the site's home page: bundles the app's mascot engine (app/src/renderer/src/components/duet)
// and inlines it into page.html, under the head below, as app/index.html. Vercel serves app/ as it
// is (no build step there), so run this after changing page.html or the engine, and commit the result.
//   npm run build   (in waitlist/; needs npm install in app/ for esbuild and the engine)
// The page's pictures are in app/a/, its fonts in app/fonts/.
import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
// esbuild comes from the app's own dependencies.
const { build } = createRequire(resolve(here, '../../app/package.json'))('esbuild')
const out = await build({ entryPoints: [resolve(here, 'duet-engine-entry.ts')], bundle: true, format: 'iife', minify: true, target: 'es2020', write: false, outdir: here })
const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/g, '<\\/script')
const css = out.outputFiles.find((f) => f.path.endsWith('.css')).text
const page = readFileSync(resolve(here, 'page.html'), 'utf8').replace('/*ENGINE_CSS*/', () => css).replace('//ENGINE_JS', () => js)

const description = 'Learn Japanese, Spanish or Korean from the shows you already watch. Duet sits on your subtitles on YouTube, Netflix, Crunchyroll and Disney+. Join the waitlist.'
const head = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f7f8f7" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121313" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">
  <title>Duet, learn a language from what you watch</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="Duet">
  <meta property="og:description" content="Your on-screen language teacher: learn Japanese, Spanish or Korean from the shows you already watch.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Duet">
  <meta property="og:url" content="https://useduet.io/">
  <meta property="og:image" content="https://useduet.io/og.png?v=4">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Duet’s face over the words Your on-screen language teacher.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://useduet.io/og.png?v=4">
  <link rel="canonical" href="https://useduet.io/">
  <link rel="icon" href="./favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="./apple-touch-icon.png">
  <link rel="preload" href="./fonts/source-serif-4-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="./fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
</head>
<body>
`
writeFileSync(resolve(here, '../app/index.html'), head + page + '\n</body>\n</html>\n')
console.log('built app/index.html', (page.length / 1024).toFixed(0) + ' KB')
