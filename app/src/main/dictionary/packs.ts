// The offline dictionary packs: one small SQLite file per language, built on our side from open
// dictionary data (scripts/build-dictionaries.mjs) and shipped inside the app in
// resources/dictionaries. Looking a word up reads the local file: no request, no credits, offline.
// What each pack is made from, and its licence, is in src/shared/sources.ts.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DictEntry } from '../../shared/flashcards'
import type { Language } from '../../shared/types'

/** The key a pack finds a word by: as shared/knowledge.ts wordKey writes a dictionary form (NFC,
 * trimmed, lower case), without the language. */
export function packKey(word: string): string {
  return word.normalize('NFC').trim().toLocaleLowerCase()
}

/** Where the packs are: in the app's resources, outside the asar archive (SQLite needs a real file). */
export function packFolder(appPath: string): string {
  return join(appPath, 'resources', 'dictionaries').replace('app.asar', 'app.asar.unpacked')
}

export class Packs {
  private open = new Map<Language, DatabaseSync | null>()

  constructor(private readonly folder: string) {}

  /** The pack's entry for a word (its dictionary form, its kana, or a form of it), or undefined when
   * the pack doesn't have it or there is no pack for the language. */
  lookUp(language: Language, word: string): DictEntry | undefined {
    const db = this.database(language)
    const key = packKey(word)
    if (!db || !key) return undefined
    const row = db
      .prepare('SELECT entry FROM words JOIN entries USING (id) WHERE word = ?')
      .get(key) as { entry: string } | undefined
    if (!row) return undefined
    try {
      return JSON.parse(row.entry) as DictEntry
    } catch {
      return undefined
    }
  }

  /** The pack's version label ("es-2026.10"), or undefined without a pack. */
  version(language: Language): string | undefined {
    const row = this.database(language)
      ?.prepare("SELECT value FROM meta WHERE key = 'version'")
      .get() as { value: string } | undefined
    return row?.value
  }

  private database(language: Language): DatabaseSync | null {
    if (this.open.has(language)) return this.open.get(language) ?? null
    const path = join(this.folder, `${language}.sqlite`)
    let db: DatabaseSync | null = null
    try {
      if (existsSync(path)) db = new DatabaseSync(path, { readOnly: true })
    } catch {
      // A damaged pack counts as none: the AI fallback (if on) fills in.
      db = null
    }
    this.open.set(language, db)
    return db
  }
}
