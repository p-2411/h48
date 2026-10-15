// Progress's IPC (window.duet.progress in src/preload/progress.ts), for the home base only (the
// strip shows no scores):
//   progress:summary  language → ProgressSummary: each video's reading level and % now and then
import { ipcMain, type WebContents } from 'electron'
import { isLanguage } from '../../shared/languages'
import type { Progress } from '.'

export function connectProgress(
  progress: Pick<Progress, 'summary'>,
  { owns }: { owns: (sender: WebContents) => boolean }
): void {
  ipcMain.handle('progress:summary', (event, language: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (!isLanguage(language)) throw new Error('Not a language Duet teaches.')
    return progress.summary(language)
  })
}
