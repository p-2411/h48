// Tests the offline dictionary packs (resources/dictionaries, built by scripts/build-dictionaries.mjs)
// and how the card backs' dictionary (src/main/dictionary) uses them: words found by their dictionary
// form, their kana or a form of them, with no AI request; the AI only for a word a pack lacks, and
// never once its fallback is off. Also the pitch drawing and the Sources list.
// Run: npx jiti scripts/test-dictionary.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-dictionary-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `module.exports = { app: { getPath: () => ${JSON.stringify(folder)} } }\n`
)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron }, moduleCache: true })
const { Packs, packKey, packFolder } = await jiti.import(resolve('src/main/dictionary/packs.ts'))
const { Dictionary } = await jiti.import(resolve('src/main/dictionary/index.ts'))
const { wordKey, keyWord } = await jiti.import(resolve('src/shared/knowledge.ts'))
const { pitchMorae } = await jiti.import(resolve('src/shared/flashcards.ts'))
const { SOURCES } = await jiti.import(resolve('src/shared/sources.ts'))

let failures = 0
async function test(name, work) {
  try {
    await work()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}\n${error.stack}`)
  }
}

const packs = new Packs(packFolder(resolve('.')))
// A stand-in AI that counts what it's asked.
const requests = []
const writer = {
  async lookUp(language, words) {
    requests.push(...words.map((item) => item.word))
    return words.map((item) => ({
      word: item.word,
      base: item.word,
      syllables: '',
      ipa: '/x/',
      pos: 'noun',
      gender: '',
      senses: ['from the AI'],
      related: [],
      example: { line: '', translation: '' }
    }))
  }
}

await test('every language has a pack with a version', () => {
  for (const language of ['es', 'ja', 'ko'])
    assert.match(packs.version(language) ?? '', new RegExp(`^${language}-\\d{4}\\.\\d{2}$`))
})

await test('a pack finds a word by the key a line’s word is kept under', () => {
  // The key Duet keeps a word under (wordKey of token.base) gives back the pack's key.
  for (const [language, base] of [
    ['es', 'Perro'],
    ['ja', '食べる'],
    ['ko', '먹다']
  ])
    assert.equal(packKey(base), keyWord(language, wordKey(language, base)))
  assert.equal(packs.lookUp('es', ' PERRO ')?.word, 'perro', 'case and spaces don’t matter')
})

await test('Spanish: a common word, and an inflected one finds its dictionary form', () => {
  const dog = packs.lookUp('es', 'perro')
  assert.equal(dog.ipa, '/ˈpero/')
  assert.equal(dog.syllables, 'pe·rro')
  assert.equal(dog.pos, 'noun')
  assert.equal(dog.gender, 'masculine')
  assert.equal(dog.senses[0], 'dog', 'the long note in brackets is left out')
  const spoke = packs.lookUp('es', 'hablamos')
  assert.equal(spoke.word, 'hablar', 'hablamos → hablar')
  assert.equal(spoke.pos, 'verb')
  assert.equal(spoke.syllables, 'ha·blar')
  assert.ok(spoke.senses.some((sense) => sense.includes('to speak')))
  assert.equal(packs.lookUp('es', 'fue')?.word, 'ser', 'fue → ser, the commoner of ser and ir')
  assert.equal(packs.lookUp('es', 'ser').gender, undefined, 'the verb ser has no gender')
  assert.equal(packs.lookUp('es', 'casa').pos, 'noun', 'the noun casa, not a form of casar')
})

await test('Japanese: a word with its kana reading and pitch, found by kanji or kana', () => {
  const eat = packs.lookUp('ja', '食べる')
  assert.equal(eat.word, '食べる')
  assert.equal(eat.reading, 'たべる')
  assert.equal(eat.pitch, 2)
  assert.equal(eat.pos, 'verb')
  assert.equal(eat.senses[0], 'to eat')
  assert.ok(eat.ipa, 'Wiktionary’s IPA')
  assert.equal(packs.lookUp('ja', 'たべる')?.word, '食べる', 'the kana finds it too')
  const thanks = packs.lookUp('ja', 'ありがとう')
  assert.equal(thanks.word, 'ありがとう', 'a word usually written in kana stays in kana')
  assert.equal(packs.lookUp('ja', '有り難う')?.word, 'ありがとう', 'its kanji still finds it')
  assert.equal(packs.lookUp('ja', '学生').pitch, 0, 'がくせい is flat')
  assert.ok(['橋', '箸'].includes(packs.lookUp('ja', 'はし')?.word), 'はし is an everyday word')
})

await test('Korean: a verb, a noun, and a particle written without its hyphen', () => {
  const eat = packs.lookUp('ko', '먹다')
  assert.equal(eat.pos, 'verb')
  assert.match(eat.ipa, /^\[mʌ/)
  assert.ok(eat.senses[0].includes('eat'))
  assert.equal(packs.lookUp('ko', '학교').senses[0], 'school')
  assert.equal(packs.lookUp('ko', '에서')?.pos, 'particle', '에서 is the particle, not Esau')
})

await test('a word the packs lack, and a language with no pack, find nothing', () => {
  assert.equal(packs.lookUp('es', 'zzzqx'), undefined)
  assert.equal(new Packs(folder).lookUp('es', 'perro'), undefined)
})

await test('the dictionary reads the pack first and asks the AI nothing for it', async () => {
  requests.length = 0
  const dictionary = new Dictionary(writer, { packs })
  assert.equal(dictionary.cached('es', 'perro')?.article, 'el', 'the article from the gender')
  assert.equal((await dictionary.entry('es', { word: 'hablamos' })).word, 'hablar')
  assert.equal((await dictionary.entry('ja', { word: '食べる' })).reading, 'たべる')
  assert.equal((await dictionary.entry('ko', { word: '먹다' })).pos, 'verb')
  dictionary.prefetch('es', [{ word: 'perro' }, { word: 'casa' }])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(requests, [], 'no AI request for a word in the pack')
})

await test('a word the pack lacks goes to the AI once, and is kept', async () => {
  requests.length = 0
  const dictionary = new Dictionary(writer, { packs })
  assert.deepEqual((await dictionary.entry('es', { word: 'zzzqx' })).senses, ['from the AI'])
  assert.equal(dictionary.cached('es', 'zzzqx').senses[0], 'from the AI')
  await dictionary.entry('es', { word: 'zzzqx' })
  assert.deepEqual(requests, ['zzzqx'], 'asked once')
})

await test('with the AI fallback off, a missing word is never asked for', async () => {
  requests.length = 0
  const dictionary = new Dictionary(writer, { packs, aiFallback: false })
  assert.equal(dictionary.available, false)
  assert.equal(await dictionary.entry('es', { word: 'yyyqx' }), undefined)
  assert.equal(dictionary.cached('es', 'perro').word, 'perro', 'the pack still answers')
  assert.deepEqual(requests, [])
})

await test('pitch: the high morae and where the pitch falls', () => {
  const marks = (reading, pitch) =>
    pitchMorae(reading, pitch)
      .map((mora) => `${mora.high ? 'H' : 'L'}${mora.drop ? 'ꜜ' : ''}`)
      .join('')
  assert.equal(marks('たべる', 2), 'LHꜜL')
  assert.equal(marks('がくせい', 0), 'LHHH', 'flat: high from the second mora on')
  assert.equal(marks('はし', 1), 'HꜜL')
  assert.equal(
    pitchMorae('しゃしん', 0)
      .map((mora) => mora.text)
      .join('|'),
    'しゃ|し|ん',
    'small kana share a mora'
  )
})

await test('Sources credits each dataset with its licence', () => {
  const byName = new Map(SOURCES.map((source) => [source.name, source]))
  assert.match(byName.get('Wiktionary').licence, /CC BY-SA/)
  assert.match(byName.get('JMdict').licence, /CC BY-SA/)
  assert.match(byName.get('UniDic').notice, /UniDic Consortium/)
  assert.match(byName.get('wordfreq').licence, /CC BY-SA/)
  for (const source of SOURCES) assert.match(source.url, /^https:\/\//)
})

try {
  rmSync(folder, { recursive: true, force: true })
} catch {
  // Left for the system to clear.
}
if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log('\nall dictionary tests passed')
