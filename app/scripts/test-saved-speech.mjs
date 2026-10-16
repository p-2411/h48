// Speech said once is kept on disk and played from there (src/main/ai/voice/saved.ts).
// Run: npx jiti scripts/test-saved-speech.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)
const { SavedSpeech } = await jiti.import('../src/main/ai/voice/saved.ts')

const folder = join(mkdtempSync(join(tmpdir(), 'duet-speech-')), 'speech')
const asked = []
const voice = {
  name: 'test/voice',
  async speak(text, language, signal, as) {
    asked.push([text, language, as])
    return { data: new TextEncoder().encode(`${as}:${text}`), mimeType: 'audio/mpeg' }
  }
}
const saved = new SavedSpeech(voice, folder, 'model|marin')
const settle = () => new Promise((done) => setTimeout(done, 50))

const first = await saved.speak('carretera', 'es', undefined, 'word')
await settle()
assert.equal(asked.length, 1, 'said once')
assert.ok(existsSync(folder) && readdirSync(folder).length === 1, 'kept on disk')
const again = await saved.speak('carretera', 'es', undefined, 'word')
assert.equal(asked.length, 1, 'the second time comes from disk: no request')
assert.deepEqual([...again.data], [...first.data])
assert.equal(again.mimeType, 'audio/mpeg')

await saved.speak('carretera', 'es', undefined, 'line')
await saved.speak('carretera ', 'es', undefined, 'word')
await settle()
assert.equal(asked.length, 2, 'a line is said apart from the word; spacing around it doesn’t matter')
await new SavedSpeech(voice, folder, 'model|cedar').speak('carretera', 'es', undefined, 'word')
assert.equal(asked.length, 3, 'another voice says it afresh')
console.log('Saved speech tests passed.')
