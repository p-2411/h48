import { ipcRenderer } from 'electron'

/** Calls the main process and waits for the answer. A failure arrives as an Error with the main
 * process's own message, without Electron's "Error invoking remote method" wrapping. */
export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''))
  }
}
