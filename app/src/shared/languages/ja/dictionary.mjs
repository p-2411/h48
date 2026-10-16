// Japanese's dictionary pack (scripts/build-dictionaries.mjs runs this): JMdict (EDRDG, CC BY-SA
// 4.0) for words, readings and meanings; Wiktionary (kaikki.org) for IPA, examples and related words;
// UniDic 2.1.2 (BSD licence) for pitch accent. Its raw data, beside the shared (see the script):
//   curl -LO https://kaikki.org/dictionary/Japanese/kaikki.org-dictionary-Japanese.jsonl.gz
//   curl -LO http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz
//   python3 -m pip download unidic-lite==1.0.8 --no-deps --no-binary :all: -d . && tar xzf unidic-lite-1.0.8.tar.gz
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Glosses joined into one meaning ("to eat; to live on").
const SENSES_PER_GLOSS = 3

const KANA_SHIFT = 0x60
const hiragana = (kana) =>
  [...kana]
    .map((ch) =>
      ch >= 'ァ' && ch <= 'ヶ' ? String.fromCharCode(ch.charCodeAt(0) - KANA_SHIFT) : ch
    )
    .join('')

/** UniDic's pitch accent (the mora the pitch falls after; 0 for flat), by "word|reading". */
function pitches(file) {
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

export default async function build({
  file,
  jsonLines,
  ranks,
  best,
  Keys,
  packKey,
  entryFrom,
  writePack,
  versionOf,
  today,
  WORDS
}) {
  const rank = ranks('large_ja')
  const accent = pitches(file)

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
