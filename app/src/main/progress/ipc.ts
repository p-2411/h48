// Progress's IPC (window.duet.progress in src/preload/progress.ts), for the home base only (the
// strip shows no scores):
//   progress:summary  language → ProgressSummary: each video's reading level and % now and then
//   progress:changed  ← videos' words changed (lines met while watching): ask again. Told at most
//                       every CHANGED_EVERY_MS, so a page open while watching keeps up cheaply.
import { ipcMain, type WebContents } from 'electron'
import { isLanguage } from '../../shared/languages'
import type { Progress } from '.'

export const CHANGED_EVERY_MS = 10_000

export function connectProgress(
  progress: Pick<Progress, 'summary' | 'on'>,
  { owns, send }: { owns: (sender: WebContents) => boolean; send: (channel: string) => void }
): void {
  ipcMain.handle('progress:summary', (event, language: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (!isLanguage(language)) throw new Error('Not a language Duet teaches.')
    return progress.summary(language)
  })
  // The first change is told after CHANGED_EVERY_MS, with any others that came meanwhile.
  let waiting: NodeJS.Timeout | undefined
  progress.on('changed', () => {
    if (waiting) return
    waiting = setTimeout(() => {
      waiting = undefined
      send('progress:changed')
    }, CHANGED_EVERY_MS)
    // Nothing to tell is no reason to keep Duet running.
    waiting.unref()
  })
}
