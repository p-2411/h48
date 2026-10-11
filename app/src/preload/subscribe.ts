import { ipcRenderer, type IpcRendererEvent } from 'electron'

/** Listens on an IPC channel; returns a function that stops listening. */
export function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}
