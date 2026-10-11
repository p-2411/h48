// Loads one of the renderer's pages into a window: from the dev server while developing, from the
// built files otherwise. Each page is an HTML file in src/renderer (index.html is the overlay).
import type { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export type Page = 'index' | 'panel' | 'cards' | 'welcome'

export function loadPage(window: BrowserWindow, page: Page): void {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && devServer) window.loadURL(`${devServer}/${page}.html`)
  else window.loadFile(join(__dirname, `../renderer/${page}.html`))
}

/** Options every Duet window shares. */
export const webPreferences = { preload: join(__dirname, '../preload/index.js'), sandbox: false }
