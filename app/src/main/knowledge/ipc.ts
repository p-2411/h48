// The knowledge ladder's IPC (window.duet.knowledge in src/preload/knowledge.ts), for Duet's own
// pages (the strip, the side panel, the home base):
//   knowledge:states       language, keys → { key: WordState }: each word's rung now
//   knowledge:set-ignored  language, key, ignored: the learner leaves a word out, or brings it back
//   knowledge:summary      language → WordsSummary: the home base's Words place
//   knowledge:changed      ← something the learner did may have moved a word: ask again (a burst of
//                            changes, such as each word of a line said back, is told once)
import { ipcMain, type WebContents } from 'electron'
import { keyWord, wordKey } from '../../shared/knowledge'
import { isLanguage } from '../../shared/languages'
import type { Language } from '../../shared/types'
import type { Knowledge } from '.'

// A page asks about at most this many words at once (a whole transcript in the side panel), each key
// at most this long.
const MAX_KEYS = 5_000
const MAX_KEY_LENGTH = 200

function language(value: unknown): Language {
  if (!isLanguage(value)) throw new Error('Not a language Duet teaches.')
  return value
}

/** A word's key, as Duet makes it (wordKey): its language, then its dictionary form, trimmed and in
 * lower case. */
function key(lang: Language, value: unknown): string {
  const word = typeof value === 'string' && value.length <= MAX_KEY_LENGTH ? keyWord(lang, value) : undefined
  if (word === undefined || !word || wordKey(lang, word) !== value) throw new Error('Name a word by its key.')
  return value
}

export function connectKnowledge(
  knowledge: Knowledge,
  { owns, send }: { owns: (sender: WebContents) => boolean; send: (channel: string) => void }
): void {
  ipcMain.handle('knowledge:states', (event, lang: unknown, keys: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (!Array.isArray(keys)) throw new Error('Name the words as a list of keys.')
    if (keys.length > MAX_KEYS) throw new Error('Too many words at once.')
    return knowledge.statesFor(
      language(lang),
      keys.filter((item): item is string => typeof item === 'string' && item.length <= MAX_KEY_LENGTH)
    )
  })
  ipcMain.handle('knowledge:set-ignored', (event, lang: unknown, word: unknown, ignored: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    if (typeof ignored !== 'boolean') throw new Error('Say whether to leave the word out.')
    const chosen = language(lang)
    knowledge.setIgnored(chosen, key(chosen, word), ignored)
  })
  ipcMain.handle('knowledge:summary', (event, lang: unknown) => {
    if (!owns(event.sender)) throw new Error('Not allowed.')
    return knowledge.summary(language(lang))
  })
  // Pages ask again on each "changed": several in a row (in one task) are told once.
  let telling = false
  knowledge.on('changed', () => {
    if (telling) return
    telling = true
    setImmediate(() => {
      telling = false
      send('knowledge:changed')
    })
  })
}
