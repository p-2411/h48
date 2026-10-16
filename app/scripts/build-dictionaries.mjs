// Builds the offline dictionary packs (resources/dictionaries/<language>.sqlite) that card backs and
// the word page read (src/main/dictionary/packs.ts), from the raw data on our side. One run per
// language, a few times a year; never on a learner's machine. See docs/design/cards/dictionary-packs.md.
//
// Sources (each credited in Settings → Sources, src/shared/sources.ts):
//   Spanish, Korean: English Wiktionary through kaikki.org's extracts (CC BY-SA 4.0 and GFDL).
//   Japanese: JMdict (EDRDG, CC BY-SA 4.0) for words, readings and meanings; Wiktionary (kaikki.org)
//     for IPA, examples and related words; UniDic 2.1.2 (BSD licence) for pitch accent.
//   Which words: wordfreq 3.1.1's frequency lists (CC BY-SA 4.0), the most common first.
//
// Get the raw data into one folder (none of it is committed):
//   curl -LO https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz
//   curl -LO https://kaikki.org/dictionary/Japanese/kaikki.org-dictionary-Japanese.jsonl.gz
//   curl -LO https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl.gz
//   curl -LO http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
//   python3 -m pip download wordfreq==3.1.1 --no-deps -d . && unzip wordfreq-3.1.1-py3-none-any.whl 'wordfreq/data/*'
//   python3 -m pip download unidic-lite==1.0.8 --no-deps --no-binary :all: -d . && tar xzf unidic-lite-1.0.8.tar.gz
// Then: npm run dictionaries -- <folder> [es] [ja] [ko]   (or npx jiti scripts/build-dictionaries.mjs …)
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { createGunzip, gunzipSync } from 'node:zlib'
import { createJiti } from 'jiti'

const here = dirname(fileURLToPath(import.meta.url))
const jiti = createJiti(import.meta.url)
const { entryFrom } = await jiti.import(resolve(here, '../src/main/dictionary/wiktionary.ts'))
const { packKey } = await jiti.import(resolve(here, '../src/main/dictionary/packs.ts'))

const OUT = resolve(here, '../resources/dictionaries')
// Words each pack keeps, the most common first.
const WORDS = 50_000
// Spanish forms (madrugué → madrugar) are kept when they are among this many of the commonest words.
const FORMS = 150_000
// Glosses joined into one Japanese meaning ("to eat; to live on").
const SENSES_PER_GLOSS = 3

const [folder, ...asked] = process.argv.slice(2)
if (!folder) {
  console.error('Usage: npx jiti scripts/build-dictionaries.mjs <raw data folder> [es] [ja] [ko]')
  process.exit(1)
}
const languages = asked.length ? asked : ['es', 'ja', 'ko']
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

/** How many of the language's 10,000 commonest words (the reading-level lists) the pack finds. As
 * wordfreq splits them, a Korean verb is its stem (먹), so 먹다 counts for it. */
function coverage(language, keys) {
  const list = JSON.parse(
    readFileSync(resolve(here, `../src/main/progress/frequency/${language}.json`), 'utf8')
  )
  const finds = (word) => {
    const key = packKey(word)
    return keys.has(key) || (language === 'ko' && (keys.has(`${key}다`) || keys.has(`${key}하다`)))
  }
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

// —— Spanish and Korean: Wiktionary ——

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

async function spanish() {
  const rank = ranks('large_es')
  const pack = await wiktionaryPack('es', 'Spanish', (key) => rank.get(key))
  writePack('es', versionOf('es', today), pack.entries, pack.keys)
}

async function korean() {
  // wordfreq's Korean is split by MeCab: verbs and adjectives are stems (먹, not 먹다), and 하다
  // words are their noun (공부, not 공부하다).
  const rank = ranks('small_ko')
  // A particle or ending (-에서) is as common as its own text.
  const rankOf = (word) => {
    const key = word.replace(/^-/, '')
    return best(
      rank.get(key),
      key.endsWith('하다') ? rank.get(key.slice(0, -2)) : undefined,
      key.endsWith('다') ? rank.get(key.slice(0, -1)) : undefined
    )
  }
  // Words wordfreq doesn't list still count, after the listed ones: Korean's list is a small one.
  const unlisted = 1_000_000
  const pack = await wiktionaryPack('ko', 'Korean', (key) => rankOf(key) ?? unlisted + key.length)
  writePack('ko', versionOf('ko', today), pack.entries, pack.keys)
}

// —— Japanese: JMdict, with Wiktionary and UniDic ——

const KANA_SHIFT = 0x60
const hiragana = (kana) =>
  [...kana]
    .map((ch) =>
      ch >= 'ァ' && ch <= 'ヶ' ? String.fromCharCode(ch.charCodeAt(0) - KANA_SHIFT) : ch
    )
    .join('')

/** UniDic's pitch accent (the mora the pitch falls after; 0 for flat), by "word|reading". */
function pitches() {
  const data = readFileSync(file('unidic-lite-1.0.8', 'unidic_lite', 'dicdir', 'sys.dic'))
  const out = new Map()
  let start = 0
  // The entries' features are stored as NUL-ended comma-separated text: orthBase is the 11th,
  // kanaBase the 19th and aType the 24th.
  for (let at = 0; at < data.length; at++) {
    if (data[at] !== 0) continue
    if (at - start > 40) {
      const fields = data.toString('utf8', start, at).split(',')
      if (fields.length >= 26) {
        const accent = /^\d+/.exec(fields[23])
        const id = `${fields[10]}|${hiragana(fields[18])}`
        if (accent && !out.has(id)) out.set(id, Number(accent[0]))
      }
    }
    start = at + 1
  }
  return out
}

// JMdict's parts of speech (its entity names), in plain English. Unlisted ones are left out.
const POS = [
  [/^n(-|$)|^vs$/, 'noun'],
  [/^v/, 'verb'],
  [/^adj-i/, 'i-adjective'],
  [/^adj-(na|no|t|f)/, 'na-adjective'],
  [/^adj/, 'adjective'],
  [/^adv/, 'adverb'],
  [/^pn$/, 'pronoun'],
  [/^prt$/, 'particle'],
  [/^conj$/, 'conjunction'],
  [/^int$/, 'interjection'],
  [/^exp$/, 'phrase'],
  [/^ctr$/, 'counter'],
  [/^num$/, 'number'],
  [/^pref$/, 'prefix'],
  [/^suf$/, 'suffix'],
  [/^aux/, 'auxiliary'],
  [/^cop/, 'copula']
]
const posName = (code) => POS.find(([pattern]) => pattern.test(code))?.[1]

const all = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1])
const entity = (value) => /^&([^;]+);$/.exec(value)?.[1] ?? value
const unescape = (value) =>
  value.replace(
    /&(lt|gt|amp|quot|apos);/g,
    (_, name) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[name]
  )
// Spellings that are searched for but never shown: search-only, irregular, outdated.
const HIDDEN = ['sK', 'sk', 'iK', 'ik', 'oK', 'ok', 'io', 'rK']
// How common JMdict says a spelling is: ichi1, news1, spec1 or gai1 are the commonest ~20,000; nfXX
// ranks the news ones in bundles of 500.
function priority(tags) {
  const nf = tags.map((tag) => /^nf(\d+)$/.exec(tag)).find(Boolean)
  if (nf) return Number(nf[1]) * 500
  if (tags.some((tag) => /1$/.test(tag))) return 12_000
  if (tags.length) return 30_000
  return undefined
}

async function japanese() {
  const rank = ranks('large_ja')
  const accent = pitches()

  // Wiktionary's Japanese, for IPA, examples and related words: by "word|reading".
  const wiktionary = new Map()
  for await (const raw of jsonLines(file('kaikki.org-dictionary-Japanese.jsonl.gz'))) {
    if (typeof raw.word !== 'string') continue
    const readings = (raw.sounds ?? [])
      .map((sound) => sound.other)
      .filter((other) => typeof other === 'string')
    for (const reading of readings.length ? readings : [raw.word]) {
      const id = `${raw.word.normalize('NFC')}|${hiragana(reading)}`
      const list = wiktionary.get(id) ?? []
      list.push(raw)
      wiktionary.set(id, list)
    }
  }

  const xml = gunzipSync(readFileSync(file('JMdict_e.gz'))).toString('utf8')
  const created = /JMdict created: (\d{4}-\d{2}-\d{2})/.exec(xml)?.[1] ?? today
  const found = []
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = match[1]
    const kanji = [...body.matchAll(/<k_ele>([\s\S]*?)<\/k_ele>/g)].map((m) => ({
      text: unescape(all(m[1], 'keb')[0]).normalize('NFC'),
      info: all(m[1], 'ke_inf').map(entity),
      pri: all(m[1], 'ke_pri')
    }))
    const readings = [...body.matchAll(/<r_ele>([\s\S]*?)<\/r_ele>/g)].map((m) => ({
      text: unescape(all(m[1], 'reb')[0]).normalize('NFC'),
      info: all(m[1], 're_inf').map(entity),
      pri: all(m[1], 're_pri'),
      only: all(m[1], 're_restr').map((value) => unescape(value).normalize('NFC')),
      noKanji: /<re_nokanji/.test(m[1])
    }))
    const senses = [...body.matchAll(/<sense>([\s\S]*?)<\/sense>/g)].map((m) => ({
      pos: all(m[1], 'pos').map(entity),
      misc: all(m[1], 'misc').map(entity),
      glosses: all(m[1], 'gloss').map(unescape)
    }))
    if (!readings.length || !senses.length) continue
    const shown = kanji.filter((k) => !k.info.some((tag) => HIDDEN.includes(tag)))
    const reading = readings.find((r) => !r.info.some((tag) => HIDDEN.includes(tag))) ?? readings[0]
    // Usually written in kana: the kana is the headword, the kanji only finds it.
    const kana = !shown.length || senses[0].misc.includes('uk')
    const headword = kana ? reading.text : shown[0].text
    const rankNow = best(
      ...shown.map((k) => rank.get(packKey(k.text))),
      kana ? rank.get(packKey(reading.text)) : undefined,
      ...shown.map((k) => priority(k.pri)),
      ...readings.map((r) => priority(r.pri))
    )
    if (rankNow === undefined) continue
    found.push({ kanji, shown, readings, senses, reading, kana, headword, rank: rankNow })
  }
  found.sort((a, b) => a.rank - b.rank)
  const kept = found.slice(0, WORDS)

  const entries = []
  const keys = new Keys()
  for (const item of kept) {
    const { shown, readings, senses, reading, headword } = item
    let pos
    const meanings = []
    for (const sense of senses) {
      pos ??= sense.pos.map(posName).find(Boolean)
      if (sense.misc.some((tag) => ['arch', 'obs', 'rare', 'dated'].includes(tag))) continue
      const gloss = sense.glosses.slice(0, SENSES_PER_GLOSS).join('; ')
      if (gloss && !meanings.includes(gloss)) meanings.push(gloss)
    }
    // A word that is only archaic or obsolete is left out (愛し would take はし from 橋).
    if (!meanings.length) continue
    const spelling = shown[0]?.text ?? headword
    const kanaOf = hiragana(reading.text)
    const wiki =
      entryFrom('ja', spelling, wiktionary.get(`${spelling}|${kanaOf}`) ?? []) ??
      entryFrom('ja', headword, wiktionary.get(`${headword}|${kanaOf}`) ?? [])
    const pitch = [spelling, headword, ...shown.map((k) => k.text)]
      .map((written) => accent.get(`${written}|${kanaOf}`))
      .find((value) => value !== undefined)
    const entry = {
      word: headword,
      reading: headword === reading.text ? undefined : reading.text,
      pitch,
      ipa: wiki?.ipa,
      pos,
      senses: meanings.slice(0, 4),
      related: wiki?.related ?? [],
      example: wiki?.example
    }
    if (headword === reading.text && pitch !== undefined) entry.reading = reading.text
    const index = entries.length
    entries.push(JSON.parse(JSON.stringify(entry)))
    // The headword and other everyday spellings find it first; its kana after (はし: 橋 or 箸, the
    // commoner wins).
    keys.claim(headword, index, item.rank)
    for (const k of shown) keys.claim(k.text, index, item.rank + 0.1)
    for (const r of readings)
      if (!r.info.some((tag) => HIDDEN.includes(tag))) keys.claim(r.text, index, WORDS + item.rank)
    for (const k of item.kanji) keys.claim(k.text, index, 2 * WORDS + item.rank)
  }
  writePack('ja', versionOf('ja', created), entries, keys.map)
}

const BUILDERS = { es: spanish, ja: japanese, ko: korean }
for (const language of languages) {
  if (!BUILDERS[language]) throw new Error(`No pack for ${language}`)
  await BUILDERS[language]()
}
