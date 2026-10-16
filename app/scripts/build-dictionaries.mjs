// Builds the offline dictionary packs (resources/dictionaries/<language>.sqlite) that card backs and
// the word page read (src/main/dictionary/packs.ts), from the raw data on our side. One run per
// language, a few times a year; never on a learner's machine. See docs/design/cards/dictionary-packs.md.
//
// Each language in src/shared/languages gets the standard pack: its English Wiktionary through
// kaikki.org's extracts (CC BY-SA 4.0 and GFDL), with the words wordfreq 3.1.1 ranks commonest
// (CC BY-SA 4.0). A language that needs more has a dictionary.mjs in its folder, whose default export
// builds the pack from the helpers here (Japanese: JMdict and UniDic; Korean: wordfreq's stems).
// Each source is credited in Settings → Sources (src/shared/sources.ts, or the language's own).
//
// Get the raw data into one folder (none of it is committed): wordfreq, and each language's
// Wiktionary (its dictionary.mjs lists anything else it needs):
//   python3 -m pip download wordfreq==3.1.1 --no-deps -d . && unzip wordfreq-3.1.1-py3-none-any.whl 'wordfreq/data/*'
//   curl -LO https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz   (and so on, by English name)
// Then: npm run dictionaries -- <folder> [es] [ja] …   (every language when none is named)
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createGunzip, gunzipSync } from 'node:zlib'
import { createJiti } from 'jiti'

const here = dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url)
const { entryFrom } = await jiti.import(resolve(here, '../src/main/dictionary/wiktionary.ts'))
const { packKey } = await jiti.import(resolve(here, '../src/main/dictionary/packs.ts'))
const { LANGUAGE_CODES, languageModule, languageName } = await jiti.import(
  resolve(here, '../src/shared/languages/index.ts')
)
const languagesFolder = resolve(here, '../src/shared/languages')

const OUT = resolve(here, '../resources/dictionaries')
// Words each pack keeps, the most common first.
const WORDS = 50_000
// A word's forms (madrugué → madrugar) find it when they are among this many of the commonest words.
const FORMS = 150_000

const [folder, ...asked] = process.argv.slice(2)
if (!folder) {
  console.error('Usage: npx jiti scripts/build-dictionaries.mjs <raw data folder> [language …]')
  process.exit(1)
}
const languages = asked.length ? asked : LANGUAGE_CODES
const file = (...parts) => {
  const path = join(folder, ...parts)
  if (!existsSync(path)) throw new Error(`Missing ${path} (see the top of this script)`)
  return path
}

// —— Reading the sources ——

/** Each line of a gzipped JSONL file, parsed. */
async function* jsonLines(path) {
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity
  })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {
      // A damaged line is skipped.
    }
  }
}

/** Just enough MessagePack for wordfreq's lists (arrays, maps, strings, numbers). */
function unpack(buffer) {
  let at = 0
  const str = (length) => {
    const value = buffer.toString('utf8', at, at + length)
    at += length
    return value
  }
  const many = (length, map) => {
    if (map) {
      const out = {}
      for (let i = 0; i < length; i++) out[read()] = read()
      return out
    }
    const out = []
    for (let i = 0; i < length; i++) out.push(read())
    return out
  }
  function read() {
    const byte = buffer[at++]
    if (byte < 0x80) return byte
    if (byte >= 0xe0) return byte - 0x100
    if ((byte & 0xf0) === 0x80) return many(byte & 0x0f, true)
    if ((byte & 0xf0) === 0x90) return many(byte & 0x0f, false)
    if ((byte & 0xe0) === 0xa0) return str(byte & 0x1f)
    const take = (size, reader) => {
      const value = reader(at)
      at += size
      return value
    }
    switch (byte) {
      case 0xc0:
        return null
      case 0xc2:
        return false
      case 0xc3:
        return true
      case 0xca:
        return take(4, (i) => buffer.readFloatBE(i))
      case 0xcb:
        return take(8, (i) => buffer.readDoubleBE(i))
      case 0xcc:
        return take(1, (i) => buffer.readUInt8(i))
      case 0xcd:
        return take(2, (i) => buffer.readUInt16BE(i))
      case 0xce:
        return take(4, (i) => buffer.readUInt32BE(i))
      case 0xd0:
        return take(1, (i) => buffer.readInt8(i))
      case 0xd1:
        return take(2, (i) => buffer.readInt16BE(i))
      case 0xd2:
        return take(4, (i) => buffer.readInt32BE(i))
      case 0xd9:
        return str(take(1, (i) => buffer.readUInt8(i)))
      case 0xda:
        return str(take(2, (i) => buffer.readUInt16BE(i)))
      case 0xdb:
        return str(take(4, (i) => buffer.readUInt32BE(i)))
      case 0xdc:
        return many(
          take(2, (i) => buffer.readUInt16BE(i)),
          false
        )
      case 0xdd:
        return many(
          take(4, (i) => buffer.readUInt32BE(i)),
          false
        )
      case 0xde:
        return many(
          take(2, (i) => buffer.readUInt16BE(i)),
          true
        )
      case 0xdf:
        return many(
          take(4, (i) => buffer.readUInt32BE(i)),
          true
        )
      default:
        throw new Error(`MessagePack type 0x${byte.toString(16)} not handled`)
    }
  }
  return read()
}

/** wordfreq's list as ranks (1 is the commonest), by the word in lower case. */
function ranks(name) {
  const [, ...buckets] = unpack(
    gunzipSync(readFileSync(file('wordfreq', 'data', `${name}.msgpack.gz`)))
  )
  const out = new Map()
  for (const word of buckets.flat()) {
    const key = packKey(word)
    if (!out.has(key)) out.set(key, out.size + 1)
  }
  return out
}

const best = (...values) => {
  const known = values.filter((value) => value !== undefined)
  return known.length ? Math.min(...known) : undefined
}

// —— Writing a pack ——

/** Writes a pack: entries, and the keys that find them (a word, its kana, or a form of it). */
function writePack(language, version, entries, keys) {
  mkdirSync(OUT, { recursive: true })
  const path = join(OUT, `${language}.sqlite`)
  rmSync(path, { force: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA page_size = 4096;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entries (id INTEGER PRIMARY KEY, entry TEXT NOT NULL);   -- JSON: shared/flashcards.ts DictEntry
    CREATE TABLE words (word TEXT PRIMARY KEY, id INTEGER NOT NULL) WITHOUT ROWID;  -- lower case, NFC
  `)
  db.exec('BEGIN')
  const meta = db.prepare('INSERT INTO meta VALUES (?, ?)')
  meta.run('version', version)
  meta.run('built', new Date().toISOString().slice(0, 10))
  const addEntry = db.prepare('INSERT INTO entries VALUES (?, ?)')
  entries.forEach((entry, index) => addEntry.run(index + 1, JSON.stringify(entry)))
  const addKey = db.prepare('INSERT INTO words VALUES (?, ?)')
  for (const [key, index] of keys) addKey.run(key, index + 1)
  db.exec('COMMIT')
  db.exec('VACUUM')
  db.close()
  const size = statSync(path).size
  console.log(
    `${language}: ${entries.length} entries, ${keys.size} keys, ${(size / 1e6).toFixed(1)} MB → ${path}`
  )
  console.log(`${language}: ${coverage(language, keys)}`)
}

/** How many of the language's 10,000 commonest words (the reading-level lists) the pack finds,
 * counting the other forms a list keeps a word as (a Korean verb's stem: 먹 for 먹다). */
function coverage(language, keys) {
  const list = JSON.parse(readFileSync(resolve(languagesFolder, language, 'frequency.json'), 'utf8'))
  const listForms = languageModule(language).listForms
  const found = new Set(keys.keys())
  if (listForms)
    for (const key of keys.keys()) for (const form of listForms(key, 'v')) found.add(packKey(form))
  const finds = (word) => found.has(packKey(word))
  const share = (count) =>
    `${Math.round((100 * list.slice(0, count).filter(finds).length) / Math.min(count, list.length))}%`
  return `finds ${share(1000)} of the 1,000 commonest words, ${share(10_000)} of the 10,000`
}

/** Gives each key to the entry that claims it best (the lowest score). */
class Keys {
  claims = new Map()
  claim(word, index, score) {
    const key = packKey(word)
    if (!key) return
    const held = this.claims.get(key)
    if (!held || score < held.score) this.claims.set(key, { index, score })
  }
  get map() {
    return new Map([...this.claims].map(([key, { index }]) => [key, index]))
  }
}

const versionOf = (language, date) => `${language}-${date.slice(0, 7).replace('-', '.')}`
const today = new Date().toISOString().slice(0, 10)

// —— Wiktionary ——

const SAYING = /\s/
// Wiktionary objects that are about writing, not words: a Hangul syllable, a character.
const NOT_WORDS = ['syllable', 'character', 'romanization', 'symbol', 'punct']
const isForm = (raw) =>
  (raw.senses ?? []).every((sense) => sense.form_of || (sense.tags ?? []).includes('form-of'))

/** Wiktionary's words for a language: the entries that have meanings of their own, ranked, with
 * the forms that point at them. */
async function wiktionaryPack(language, name, rankOf) {
  const path = file(`kaikki.org-dictionary-${name}.jsonl.gz`)
  // First pass: which words have meanings of their own, and which forms point at which words.
  const lemmas = new Map() // key → rank
  const forms = new Map() // form key → word keys
  for await (const raw of jsonLines(path)) {
    const word = typeof raw.word === 'string' ? raw.word.normalize('NFC') : ''
    if (!word || SAYING.test(word) || NOT_WORDS.includes(raw.pos)) continue
    const key = packKey(word)
    if (!isForm(raw)) lemmas.set(key, rankOf(key))
    for (const sense of raw.senses ?? [])
      for (const target of sense.form_of ?? []) {
        if (typeof target.word !== 'string') continue
        const to = packKey(target.word)
        const list = forms.get(key) ?? []
        if (!list.includes(to)) list.push(to)
        forms.set(key, list)
      }
  }
  // A word is as common as its commonest form (madrugué counts for madrugar).
  for (const [form, targets] of forms) {
    const rank = rankOf(form)
    if (rank === undefined) continue
    for (const target of targets)
      if (lemmas.has(target)) lemmas.set(target, best(lemmas.get(target), rank))
  }
  const kept = [...lemmas]
    .filter(([, rank]) => rank !== undefined)
    .sort((a, b) => a[1] - b[1])
    .slice(0, WORDS)
  const wanted = new Map(kept)
  console.log(`${language}: ${lemmas.size} words with meanings, ${wanted.size} kept`)

  // Second pass: the kept words' objects.
  const raws = new Map()
  for await (const raw of jsonLines(path)) {
    const word = typeof raw.word === 'string' ? raw.word.normalize('NFC') : ''
    if (!word || NOT_WORDS.includes(raw.pos)) continue
    const key = packKey(word)
    if (!wanted.has(key)) continue
    const list = raws.get(key) ?? []
    list.push(raw)
    raws.set(key, list)
  }

  const entries = []
  const keys = new Keys()
  for (const [key, rank] of kept) {
    const group = raws.get(key) ?? []
    // The word as Wiktionary writes it in lower case first (papa before Papa).
    const exact = group.filter((raw) => raw.word.normalize('NFC') === key)
    const own = exact.length ? exact : group
    const entry = entryFrom(language, own[0]?.word.normalize('NFC') ?? key, own)
    if (!entry) continue
    // A name gives way to a word written the same (에서, from, before 에서, Esau).
    keys.claim(key, entries.length, entry.pos === 'name' ? rank + WORDS : rank)
    // A Korean particle or ending is written with a hyphen (-에서); a line's word has none.
    if (key.length > 1 && key.startsWith('-')) keys.claim(key.slice(1), entries.length, rank + 0.5)
    entries.push(entry)
  }
  // Forms find their word, after every word (a word that is also a form is itself first).
  const index = new Map([...keys.claims].map(([key, { index }]) => [key, index]))
  const lemmaScore = WORDS + FORMS
  for (const [form, targets] of forms) {
    const rank = rankOf(form)
    if (rank === undefined || rank > FORMS || index.has(form)) continue
    const target = targets
      .filter((to) => index.has(to))
      .sort((a, b) => (wanted.get(a) ?? Infinity) - (wanted.get(b) ?? Infinity))[0]
    if (target !== undefined) keys.claim(form, index.get(target), lemmaScore + rank)
  }
  return { entries, keys: keys.map }
}

// —— Each language: its folder's dictionary.mjs, or the standard Wiktionary pack ——

/** The standard pack: the language's English Wiktionary (kaikki.org-dictionary-<Name>.jsonl.gz),
 * ranked by its wordfreq list (the large one when wordfreq has it). */
async function standard({ language, name }) {
  const list = existsSync(join(folder, 'wordfreq', 'data', `large_${language}.msgpack.gz`))
    ? `large_${language}`
    : `small_${language}`
  const rank = ranks(list)
  const pack = await wiktionaryPack(language, name, (key) => rank.get(key))
  writePack(language, versionOf(language, today), pack.entries, pack.keys)
}

const kit = { file, jsonLines, ranks, best, Keys, packKey, entryFrom, wiktionaryPack, writePack, versionOf, today, WORDS }
for (const language of languages) {
  if (!LANGUAGE_CODES.includes(language)) throw new Error(`${language} isn't a language in src/shared/languages`)
  const own = resolve(languagesFolder, language, 'dictionary.mjs')
  const build = existsSync(own) ? (await import(pathToFileURL(own).href)).default : standard
  await build({ ...kit, language, name: languageName(language) })
}
