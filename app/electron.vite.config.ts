import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // One page per window: the overlay (index.html), the tutor, the side panel and My cards.
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          ['index', 'tutor', 'panel', 'cards'].map((page) => [page, resolve(`src/renderer/${page}.html`)])
        )
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
