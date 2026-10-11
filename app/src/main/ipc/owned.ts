// Pages are untrusted: a feature's handlers answer only the window it belongs to.
import { ipcMain, type WebContents } from 'electron'

export type Handle = (channel: string, work: (...args: unknown[]) => unknown) => void

/** Registers `<prefix>:<channel>` handlers that only `owns`'s window may call; others get `refusal`. */
export function ownedHandler(prefix: string, owns: (sender: WebContents) => boolean, refusal: string): Handle {
  return (channel, work) =>
    ipcMain.handle(`${prefix}:${channel}`, (event, ...args) => {
      if (!owns(event.sender)) throw new Error(refusal)
      return work(...args)
    })
}
