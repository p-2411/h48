// Writes the language registry from the folders in src/shared/languages: every folder with an
// index.ts is a language Duet teaches. Adding a language is adding its folder (see the README
// there); this script, run before `npm run dev`, typecheck, test and build:mac, lists it.
//   src/shared/languages/registry.ts     the language modules (the app, main and pages)
//   src/main/progress/frequency-lists.ts their word-frequency lists (main only: they are large)
// Both are committed, so a build that skips this script still has them.
//   node scripts/languages.mjs           writes them when they changed
//   node scripts/languages.mjs --check   fails when they are out of date
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const folder = join(app, 'src/shared/languages')
const check = process.argv.includes('--check')

const codes = readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(folder, entry.name, 'index.ts')))
  .map((entry) => entry.name)
  .sort()
if (!codes.length) throw new Error(`No languages in ${folder}`)
for (const code of codes)
  if (!/^[a-z]{2,3}$/.test(code))
    throw new Error(`${code}: a language's folder is its ISO 639 code (es, ja, ko)`)

const HEAD =
  "// Made by scripts/languages.mjs from the language folders here. Don't edit it: add a folder."

const registry = `${HEAD}
import type { LanguageModule } from './module'
${codes.map((code) => `import ${code} from './${code}'`).join('\n')}

export const LANGUAGE_MODULES = { ${codes.join(', ')} } satisfies Record<string, LanguageModule>
`

const lists = `${HEAD.replace('here', 'in src/shared/languages')}
import type { Language } from '../../shared/languages'
${codes.map((code) => `import ${code} from '../../shared/languages/${code}/frequency.json'`).join('\n')}

export const FREQUENCY_LISTS: Record<Language, string[]> = { ${codes.join(', ')} }
`

let stale = false
for (const [path, text] of [
  [join(folder, 'registry.ts'), registry],
  [join(app, 'src/main/progress/frequency-lists.ts'), lists]
]) {
  const now = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (now === text) continue
  stale = true
  if (check) console.error(`${path} is out of date: run node scripts/languages.mjs`)
  else writeFileSync(path, text)
}
if (check && stale) process.exit(1)
