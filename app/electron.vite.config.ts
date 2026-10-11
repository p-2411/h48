import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // One page per window: the overlay (index.html) and the tutor (tutor.html).
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), tutor: resolve('src/renderer/tutor.html') }
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
