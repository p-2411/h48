// Made by scripts/languages.mjs from the language folders here. Don't edit it: add a folder.
import type { LanguageModule } from './module'
import es from './es'
import ja from './ja'
import ko from './ko'

export const LANGUAGE_MODULES = { es, ja, ko } satisfies Record<string, LanguageModule>
