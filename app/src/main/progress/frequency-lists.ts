// Made by scripts/languages.mjs from the language folders in src/shared/languages. Don't edit it: add a folder.
import type { Language } from '../../shared/languages'
import es from '../../shared/languages/es/frequency.json'
import ja from '../../shared/languages/ja/frequency.json'
import ko from '../../shared/languages/ko/frequency.json'

export const FREQUENCY_LISTS: Record<Language, string[]> = { es, ja, ko }
