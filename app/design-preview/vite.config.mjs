// Serves the home window in a plain browser with a fake window.duet, for design work:
//   npx vite --config design-preview/vite.config.mjs
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const renderer = resolve(__dirname, '../src/renderer')
/** A file in this folder, as the dev server serves it. */
const fs = (name) => `/@fs/${resolve(__dirname, name).replace(/\\/g, '/')}`
export default defineConfig({
  root: renderer,
  publicDir: resolve(renderer, 'public'),
  resolve: { alias: { '@renderer': resolve(renderer, 'src') } },
  server: { port: Number(process.env.PORT) || 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [resolve(__dirname, '..')] } },
  plugins: [
    react(),
    {
      name: 'mock-duet',
      transformIndexHtml: (html) =>
        html
          .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
          .replace(
            '<head>',
            `<head><script src="${fs('mock-duet.js')}"></script><script type="module" src="${fs('mock-flashcards.ts')}"></script>`
          )
    }
  ]
})
