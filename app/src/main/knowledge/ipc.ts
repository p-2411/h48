// The knowledge ladder's IPC (window.duet.knowledge in src/preload/knowledge.ts), for Duet's own
// pages (the strip, the side panel, the home base):
//   knowledge:states       language, keys → { key: WordState }: each word's rung now
//   knowledge:set-ignored  language, key, ignored: the learner leaves a word out, or brings it back
//   knowledge:summary      language → WordsSummary: the home base's Words place
//   knowledge:changed      ← something the learner did may have moved a word: ask again
import { ipcMain, type WebContents } from 'electron'
import { LANGUAGE_CODES } from '../../shared/languages'
import type { Language } from '../../shared/types'
import type { Knowledge } from '.'

function language(value: unknown): Language {
  if (!LANGUAGE_CODES.includes(value as Language)) throw new Error('Not a language Duet teaches.')
  return value as Language
}

export function connectKnowledge(
  knowledge: Knowledge,
  { owns, send }: { owns: (sender: WebContents) => boolean; send: (channel: string) => void }
): void {
  ipcMain.handle('knowledge:states', (event, lang: unknown, keys: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (!Array.isArray(keys)) throw new Error('Name the words as a list of keys.')
    return knowledge.statesFor(language(lang), keys.filter((key): key is string => typeof key === 'string'))
  })
  ipcMain.handle('knowledge:set-ignored', (event, lang: unknown, key: unknown, ignored: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (typeof key !== 'string' || typeof ignored !== 'boolean') throw new Error('Name a word, and whether to leave it out.')
    knowledge.setIgnored(language(lang), key, ignored)
  })
  ipcMain.handle('knowledge:summary', (event, lang: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    return knowledge.summary(language(lang))
  })
  knowledge.on('changed', () => send('knowledge:changed'))
}
