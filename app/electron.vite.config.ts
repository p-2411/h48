import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Source maps for crash reports (src/main/reports): with SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT in the environment, each build uploads its maps to Sentry and then deletes them,
// so they never ship in the app. Without the token, no maps are made.
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const uploadMaps = !!process.env.SENTRY_AUTH_TOKEN
const sourcemap = uploadMaps ? ('hidden' as const) : false
const sentry = (): ReturnType<typeof sentryVitePlugin>[] =>
  uploadMaps
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: `duet@${version}` },
          sourcemaps: { filesToDeleteAfterUpload: ['out/**/*.map'] },
          telemetry: false
        })
      ]
    : []

export default defineConfig({
  main: { build: { sourcemap }, plugins: [sentry()] },
  preload: { build: { sourcemap }, plugins: [sentry()] },
  renderer: {
    // One page per window: the overlay (index.html), the side panel, the home base and the
    // first-run welcome.
    build: {
      sourcemap,
      rollupOptions: {
        input: Object.fromEntries(
          ['index', 'panel', 'home', 'welcome'].map((page) => [page, resolve(`src/renderer/${page}.html`)])
        )
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), sentry()]
  }
})
