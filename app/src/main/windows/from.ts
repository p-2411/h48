// Pages are untrusted: a handler acts only for the window it belongs to. This says whether a message
// came from that window's page.
import type { BrowserWindow, WebContents } from 'electron'

export function isFrom(window: BrowserWindow | undefined, sender: WebContents): boolean {
  return !!window && !window.isDestroyed() && sender === window.webContents
}
