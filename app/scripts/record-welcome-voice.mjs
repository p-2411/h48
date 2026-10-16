// Records the first run's lines (and Today's cheers, home/daily/cheers.ts) once in Duet's own voice: GPT-Live (gpt-live-1, the model behind
// voice conversations, in DUET_LIVE_VOICE), so the clips sound like Duet does when you talk to it.
// Each line is said in its own short session over GPT-Live's WebSocket: the line goes in as
// commentary (as the app's greeting does), the audio comes back, its transcript is checked against
// the line, and the speech is trimmed and saved as an MP3 in src/renderer/public/voice/welcome. The
// clips are listed in src/renderer/src/welcome/voice-clips.json; the app plays them with no API call.
//   npm run voice:welcome            records only the lines that have no clip yet
//   npm run voice:welcome -- --force records them all again
//   npm run voice:welcome -- --force --only=Duet   just the lines with "Duet" in them (to try a change)
// Needs OPENAI_API_KEY in app/.env.local. Clips whose line is gone are deleted.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Mp3Encoder } from '@breezystack/lamejs'
import { clipKey, voiceLines } from '../src/renderer/src/welcome/lines.ts'
import { cheerLines } from '../src/renderer/src/home/daily/cheers.ts'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
if (!process.env.OPENAI_API_KEY) throw new Error('Add OPENAI_API_KEY to app/.env.local first.')
const VOICE = process.env.DUET_LIVE_VOICE || 'marin'
const RATE = 24000
const force = process.argv.includes('--force')
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)
const out = resolve('src/renderer/public/voice/welcome')
const manifest = resolve('src/renderer/src/welcome/voice-clips.json')
mkdirSync(out, { recursive: true })

const LANGUAGE = { 'es-ES': 'Spanish (Spain)', 'ja-JP': 'Japanese', 'ko-KR': 'Korean' }
const PERSONA =
  'You are Duet, a small, friendly companion who helps people learn a language from the shows they watch. Warm, bright, encouraging, with a smile in your voice; relaxed and natural, like a friend, never salesy or over the top. In this session you only say out loud the lines you are given, word for word: never add, drop or change a word, and never answer or comment on them.'
/** How a line is voiced, per kind (lines.ts, Delivery). */
function direction(line) {
  const language = LANGUAGE[line.lang] ?? line.lang
  // Today's cheers (home/daily/cheers.ts): a quick, genuinely pleased word to a friend who just did well.
  if (line.delivery === 'cheer') return 'Say the next line out loud in English, exactly as written, the way you would cheer on a friend who just did well: genuinely pleased, warm and bright, with a real smile in your voice and natural, lively rhythm, not flat or announcer-like. Then stop.'
  if (line.delivery === 'duet') return 'Say the next line out loud in English, exactly as written, as you would in a friendly conversation. Then stop.'
  if (line.delivery === 'native') return `Say the next line out loud in ${language}, exactly as written, as a native speaker would, naturally and a little slower than usual so a learner can follow. Then stop.`
  return `Say the next ${language} word or phrase out loud once, exactly as written, clearly and a little slower than usual, as a native speaker would, so a learner can hear each sound. Nothing else. Then stop.`
}

// ── Saying one line ────────────────────────────────────────────────────────────────────────────
const LOUD = 600 // a sample this loud (of 32768) counts as speech
/** One session: the line said by GPT-Live; resolves with its PCM16 audio and transcript. */
function say(line) {
  return new Promise((done, fail) => {
    const ws = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } })
    const chunks = []
    let transcript = ''
    let spoke = false
    let quietMs = 0
    let silence
    const finish = (error) => {
      clearInterval(silence)
      clearTimeout(limit)
      try {
        ws.close()
      } catch {
        // already closed
      }
      if (error) fail(error)
      else done({ pcm: Buffer.concat(chunks), transcript: transcript.trim() })
    }
    const limit = setTimeout(() => finish(new Error('timed out')), 40000)
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: 'session.start', session: { model: 'gpt-live-1', store: false, instructions: PERSONA, audio: { format: { type: 'audio/pcm', rate: RATE }, output: { voice: VOICE } } } }))
    ws.onerror = () => finish(new Error('connection failed'))
    ws.onmessage = (message) => {
      const event = JSON.parse(message.data)
      if (event.type === 'error') return finish(new Error(event.error?.message ?? JSON.stringify(event)))
      if (event.type === 'session.started') {
        // The session's timeline runs on incoming audio: a muted microphone's silence, 20 ms at a time.
        const quiet = Buffer.alloc((RATE / 50) * 2).toString('base64')
        silence = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'session.input_audio.append', audio: quiet })), 20)
        ws.send(JSON.stringify({ type: 'session.instructions.append', delegation_id: null, content: direction(line) }))
        ws.send(JSON.stringify({ type: 'session.commentary.append', delegation_id: null, content: line.text }))
      }
      if (event.type === 'session.output_transcript.delta') transcript += event.delta
      if (event.type === 'session.output_audio.delta') {
        const pcm = Buffer.from(event.delta, 'base64')
        let loud = false
        for (let i = 0; i < pcm.length; i += 2) if (Math.abs(pcm.readInt16LE(i)) > LOUD) loud = true
        if (loud) {
          spoke = true
          quietMs = 0
        } else if (spoke) quietMs += (pcm.length / 2 / RATE) * 1000
        if (spoke) chunks.push(pcm)
        // Done once it has spoken and gone quiet for a while.
        if (spoke && quietMs > 1500) finish()
      }
    }
  })
}

/** The speech alone: from just before the first loud sample to just after the last. */
function trim(pcm) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
  let first = 0, last = samples.length - 1
  while (first < samples.length && Math.abs(samples[first]) <= LOUD) first++
  while (last > first && Math.abs(samples[last]) <= LOUD) last--
  const start = Math.max(0, first - Math.round(RATE * 0.08)), end = Math.min(samples.length, last + Math.round(RATE * 0.18))
  const out = samples.slice(start, end)
  // Fade the edges so the clip never clicks.
  const fade = Math.min(out.length / 2, RATE * 0.01)
  for (let i = 0; i < fade; i++) {
    out[i] = Math.round((out[i] * i) / fade)
    out[out.length - 1 - i] = Math.round((out[out.length - 1 - i] * i) / fade)
  }
  return out
}

function mp3(samples) {
  const encoder = new Mp3Encoder(1, RATE, 64)
  const parts = []
  for (let i = 0; i < samples.length; i += 1152) parts.push(encoder.encodeBuffer(samples.subarray(i, i + 1152)))
  parts.push(encoder.flush())
  return Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.length)))
}

// ── Checking it said the line ──────────────────────────────────────────────────────────────────
const plain = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}
/** English must be word for word; a line in the language may come back transcribed in another script
 * (kana for kanji), so it needs to be close. */
function matches(line, transcript) {
  const want = plain(line.text), got = plain(transcript)
  if (line.lang.startsWith('en')) return want === got
  return got.length > 0 && distance(want, got) <= Math.max(1, Math.floor(want.length * 0.34))
}

// ── The run ────────────────────────────────────────────────────────────────────────────────────
// The first run's lines, and what Duet says between the steps of Today's session.
const lines = [...voiceLines(), ...cheerLines()]
const keys = new Set(lines.map((line) => clipKey(line.lang, line.text)))
const todo = lines
  .filter((line) => !only || line.text.includes(only))
  .filter((line) => force || !existsSync(resolve(out, `${clipKey(line.lang, line.text)}.mp3`)))
console.log(`${lines.length} lines, ${todo.length} to record with gpt-live-1 (${VOICE})`)

let count = 0
const failed = []
async function record(line) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { pcm, transcript } = await say(line)
      if (!matches(line, transcript)) throw new Error(`said "${transcript}"`)
      writeFileSync(resolve(out, `${clipKey(line.lang, line.text)}.mp3`), mp3(trim(pcm)))
      console.log(`  ${++count}/${todo.length}  ${line.lang}  ${line.text}`)
      return
    } catch (error) {
      if (attempt === 4) {
        failed.push(`${line.text}: ${error.message}`)
        // Never keep an older recording of it: the app falls back to the system's voice instead.
        rmSync(resolve(out, `${clipKey(line.lang, line.text)}.mp3`), { force: true })
        console.log(`  failed  ${line.lang}  ${line.text}  (${error.message})`)
      }
    }
  }
}
// A few sessions at a time.
const queue = [...todo]
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await record(queue.shift()) }))

for (const file of readdirSync(out)) if (!keys.has(file.replace(/\.mp3$/, ''))) rmSync(resolve(out, file))
// Only the clips that exist: a line that failed falls back to the system's voice in the app.
const recorded = [...keys].filter((key) => existsSync(resolve(out, `${key}.mp3`))).sort()
writeFileSync(manifest, JSON.stringify(recorded, null, 2) + '\n')
console.log(`done: ${recorded.length} of ${keys.size} clips${failed.length ? `; ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`)
