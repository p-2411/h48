// Accounts and Duet's server (src/main/account, src/main/ai/access.ts): how Duet reaches OpenAI
// (a key in development, otherwise Duet's server with the learner's sign-in), the device id, the
// server's replies at a cap, watch time, live voice minutes, and the WorkOS sign-in wrapper.
// Run: node scripts/test-account.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-account-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(fakeElectron, `module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false } }\n`)
const jiti = createJiti(import.meta.url, { alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron } })

const { openAIAccess, useDuetServer } = await jiti.import('../src/main/ai/access.ts')
const { ModelError, duetModelError } = await jiti.import('../src/main/ai/errors.ts')
const { capSentence } = await jiti.import('../src/shared/usage.ts')
const { deviceId, hardwareId } = await jiti.import('../src/main/account/device.ts')
const { DuetServer, DuetServerError } = await jiti.import('../src/main/account/server.ts')
const { ServerWatch } = await jiti.import('../src/main/account/watch.ts')
const { LiveMeter } = await jiti.import('../src/main/account/live.ts')
const { Account } = await jiti.import('../src/main/account/index.ts')
const { createModels } = await jiti.import('../src/main/ai/index.ts')
const { createVoiceModels } = await jiti.import('../src/main/ai/voice/index.ts')
const { textModel } = await jiti.import('../src/main/ai/text.ts')
const { createLiveSession, safeLiveError } = await jiti.import('../src/main/tutor/live.ts')
const { replyInText } = await jiti.import('../src/main/tutor/text.ts')
const { LineSession } = await jiti.import('../src/main/session.ts')

const settle = () => new Promise((done) => setTimeout(done, 0))
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

try {
  // --- How Duet reaches OpenAI. ---
  useDuetServer(undefined)
  assert.deepEqual(openAIAccess({ OPENAI_API_KEY: 'sk-dev' }), { apiKey: 'sk-dev' }, 'a development key goes straight to OpenAI')
  assert.equal(openAIAccess({}), undefined, 'no key and no server: no access')
  const serverAccess = { apiKey: 'duet', baseURL: 'https://api.useduet.io/v1', fetch: async () => json({}) }
  useDuetServer(serverAccess)
  assert.equal(openAIAccess({}), serverAccess, 'otherwise Duet’s server, with the learner’s sign-in')
  assert.equal(
    openAIAccess({ OPENAI_API_KEY: 'sk-dev', DUET_API_URL: 'http://localhost:8787/v1' }),
    serverAccess,
    'DUET_API_URL makes a development build use the server even with a key'
  )
  useDuetServer(undefined)

  // --- The device id: a hash of the hardware id, never the id itself. ---
  const mac = hardwareId('darwin', () => '  "IOPlatformUUID" = "1234-ABCD"\n', () => '')
  assert.equal(mac, '1234-ABCD', 'the Mac’s platform UUID')
  assert.equal(hardwareId('linux', () => '', () => 'abc123\n'), 'abc123', 'Linux’s machine id')
  assert.equal(
    hardwareId('win32', () => '    MachineGuid    REG_SZ    9f-88\r\n', () => ''),
    '9f-88',
    'Windows’ machine GUID'
  )
  assert.equal(hardwareId('darwin', () => { throw new Error('no ioreg') }, () => ''), undefined, 'none found: undefined')
  const id = deviceId('1234-ABCD')
  assert.match(id, /^[0-9a-f]{64}$/, 'a 64-character hex hash')
  assert.ok(!id.includes('1234'), 'not the raw id')
  assert.equal(deviceId('1234-ABCD'), id, 'the same Mac gives the same id')

  // --- Cap sentences. ---
  assert.equal(
    capSentence({ cap: 'credits', resets_at: '2026-11-01T00:00:00.000Z' }, 'UTC'),
    'You’ve used this month’s Duet credits. More come on 1 November.'
  )
  assert.equal(
    capSentence({ cap: 'hours', resets_at: '2026-10-19T00:00:00.000Z' }, 'UTC'),
    'You’ve used your watch hours. More come on Monday 19 October.'
  )
  assert.equal(
    capSentence({ cap: 'credits', blocked: true, resets_at: '2026-11-01T00:00:00.000Z' }, 'UTC'),
    'Free Duet is limited to two accounts on one computer. Upgrade to go on.'
  )

  // --- The server's errors as the AI layer's ModelError. ---
  const capError = Object.assign(new Error('402'), {
    status: 402,
    error: { type: 'duet', code: 'usage_cap', cap: 'credits', resets_at: '2026-11-01T00:00:00.000Z' }
  })
  const quota = duetModelError(capError)
  assert.ok(quota instanceof ModelError)
  assert.equal(quota.kind, 'quota', 'a cap is its own kind: not tried again')
  assert.match(quota.message, /credits/)
  const signedOut = duetModelError(Object.assign(new Error('401'), { status: 401, error: { type: 'duet', code: 'signed_out' } }))
  assert.equal(signedOut.kind, 'auth')
  assert.equal(signedOut.message, 'Sign in to Duet to use this.')
  assert.equal(duetModelError(Object.assign(new Error('429'), { status: 429, error: { message: 'busy' } })), undefined, 'OpenAI’s own errors are left alone')

  // --- The server: each request carries the sign-in, the device and the watch session. ---
  const sent = []
  let token = 'tok-1'
  let reply = () => json({ ok: true })
  const server = new DuetServer({
    baseURL: 'https://api.useduet.io/v1',
    token: async () => token,
    device: 'd'.repeat(64),
    fetch: async (url, init) => {
      sent.push({ url: String(url), headers: new Headers(init?.headers), body: init?.body })
      return reply(String(url), init)
    }
  })
  await server.openAIFetch('https://api.useduet.io/v1/responses', { method: 'POST', headers: { authorization: 'Bearer duet', 'x-duet-feature': 'explain' }, body: '{}' })
  assert.equal(sent[0].headers.get('authorization'), 'Bearer tok-1', 'the learner’s token replaces the placeholder key')
  assert.equal(sent[0].headers.get('x-duet-device'), 'd'.repeat(64))
  assert.equal(sent[0].headers.get('x-duet-feature'), 'explain', 'the call’s own headers stay')
  assert.equal(sent[0].headers.get('x-duet-watch'), null, 'no watch session yet')

  // Signed out: no request leaves; the SDK gets a 401 it will not retry.
  token = null
  const events = []
  server.on('signed-out', () => events.push('signed-out'))
  server.on('cap', (error) => events.push(['cap', error.cap]))
  const before = sent.length
  const out = await server.openAIFetch('https://api.useduet.io/v1/responses', { method: 'POST', body: '{}' })
  assert.equal(out.status, 401)
  assert.equal(out.headers.get('x-should-retry'), 'false')
  assert.equal((await out.json()).error.code, 'signed_out')
  assert.equal(sent.length, before, 'nothing is sent signed out')
  assert.deepEqual(events, ['signed-out'])
  token = 'tok-2'

  // A cap reply is passed on and announced, so the app can show it everywhere.
  reply = () => json({ error: { type: 'duet', code: 'usage_cap', cap: 'hours', resets_at: '2026-10-19T00:00:00.000Z' } }, 402)
  const capped = await server.openAIFetch('https://api.useduet.io/v1/responses', { method: 'POST', body: '{}' })
  assert.equal(capped.status, 402)
  assert.deepEqual(events.at(-1), ['cap', 'hours'])

  // Lines without a watch session: the server asks for one; Duet opens it and tries once more.
  const order = []
  reply = (url, init) => {
    if (url.endsWith('/duet/watch/start')) return order.push('start'), json({ id: 'w1', beatEveryMs: 30000 })
    const watch = new Headers(init.headers).get('x-duet-watch')
    order.push(watch ?? 'none')
    return watch ? json({ id: 'resp' }) : json({ error: { type: 'duet', code: 'watch_required' } }, 409)
  }
  const retried = await server.openAIFetch('https://api.useduet.io/v1/responses', { method: 'POST', body: '{"a":1}' })
  assert.equal(retried.status, 200)
  assert.deepEqual(order, ['none', 'start', 'w1'], 'watch session opened, then the call again with it')
  assert.equal(server.watchId, 'w1')

  // Duet's own routes: JSON in and out; errors carry the server's code.
  reply = () => json({ plan: 'free' })
  assert.deepEqual(await server.request('/duet/me', undefined, 'GET'), { plan: 'free' })
  assert.equal(sent.at(-1).url, 'https://api.useduet.io/v1/duet/me')
  reply = () => json({ error: { type: 'duet', code: 'billing', message: 'Payments are not set up yet.' } }, 503)
  await assert.rejects(server.request('/duet/billing/checkout', {}), (error) => error instanceof DuetServerError && error.code === 'billing' && error.status === 503)

  // --- Watch time: a session while watching, a beat every 30 s, an end when watching stops. ---
  const calls = []
  const fakeServer = {
    watchId: undefined,
    openWatch: async () => (calls.push('start'), (fakeServer.watchId = 'w9')),
    request: async (path) => (calls.push(path), { ok: true }),
    forgetWatch: () => (fakeServer.watchId = undefined)
  }
  const watch = new ServerWatch(fakeServer)
  watch.tick(false, 0)
  await settle()
  assert.deepEqual(calls, [], 'nothing while not watching')
  watch.tick(true, 1_000)
  await settle()
  assert.deepEqual(calls, ['start'], 'watching opens a session')
  watch.tick(true, 20_000)
  await settle()
  assert.deepEqual(calls, ['start'], 'no beat before 30 s')
  watch.tick(true, 31_000)
  await settle()
  assert.deepEqual(calls, ['start', '/duet/watch/w9/beat'])
  watch.tick(false, 40_000)
  await settle()
  assert.deepEqual(calls, ['start', '/duet/watch/w9/beat', '/duet/watch/w9/end'], 'stopping ends it')
  assert.equal(fakeServer.watchId, undefined)
  watch.tick(true, 50_000)
  await settle()
  assert.equal(calls.at(-1), 'start', 'watching again opens a new session')

  // A beat refused (the hours cap, or a session the server ended) lets the session go.
  fakeServer.request = async (path) => {
    calls.push(path)
    throw new DuetServerError(402, 'usage_cap', 'Hours used up', { cap: 'hours' })
  }
  watch.tick(true, 81_000)
  await settle()
  assert.equal(fakeServer.watchId, undefined, 'a refused beat drops the session')

  // --- Live voice minutes. ---
  const minutes = []
  const stops = []
  let minuteReply = { stop: false }
  const meter = new LiveMeter(
    { request: async (path) => (minutes.push(path), path.endsWith('/minute') ? minuteReply : { ok: true }) },
    (sentence) => stops.push(sentence),
    5
  )
  meter.started('live_1')
  await new Promise((done) => setTimeout(done, 12))
  assert.ok(minutes.filter((path) => path === '/duet/live/live_1/minute').length >= 1, 'a minute call while the call is open')
  meter.ended()
  await settle()
  assert.equal(minutes.at(-1), '/duet/live/live_1/end', 'ending tells the server')
  const after = minutes.length
  await new Promise((done) => setTimeout(done, 12))
  assert.equal(minutes.length, after, 'no minute calls after the end')
  meter.ended()
  assert.equal(minutes.length, after, 'ending twice tells the server once')

  minuteReply = { stop: true, cap: 'credits', resets_at: '2026-11-01T00:00:00.000Z' }
  meter.started('live_2')
  await new Promise((done) => setTimeout(done, 12))
  assert.equal(stops.length, 1, 'at the cap the call is stopped, once')
  assert.match(stops[0], /credits/)
  meter.ended()
  await settle()
  assert.ok(!minutes.includes('/duet/live/live_2/end'), 'a call the server ended is not ended again')

  // --- The WorkOS wrapper: the SDK's handlers are kept in main; no window can call them. ---
  let config
  const changes = []
  const handled = new Map()
  const fakeAuthKit = (given, options) => {
    config = given
    options.ipcMain.handle('authkit:get-access-token', async () => ({ ok: true, data: 'access-1' }))
    options.ipcMain.handle('authkit:get-user', async () => ({ ok: true, data: { user: { email: 'a@example.com' } } }))
    options.ipcMain.handle('authkit:sign-in', async () => {
      handled.set('signed-in', true)
      for (const window of options.browserWindow.getAllWindows())
        window.webContents.send('authkit:auth-changed', { user: { email: 'a@example.com' } })
      return { ok: true, data: null }
    })
    options.ipcMain.handle('authkit:sign-out', async () => ({ ok: true, data: {} }))
    return { registerProtocol: () => handled.set('protocol', true), cleanup: () => undefined }
  }
  const account = new Account({ clientId: 'client_1', createAuthKit: fakeAuthKit })
  account.on('change', (user) => changes.push(user?.email ?? null))
  assert.equal(config.redirectUri, 'duet://auth/callback')
  assert.equal(config.clientId, 'client_1')
  account.register()
  assert.equal(handled.get('protocol'), true)
  assert.equal(await account.token(), 'access-1')
  assert.deepEqual(await account.user(), { email: 'a@example.com' })
  await account.signIn()
  assert.deepEqual(changes, ['a@example.com'], 'a sign-in is heard in main')
  await account.signOut()
  assert.deepEqual(changes, ['a@example.com', null], 'and a sign-out')

  // Signed out, or the SDK failing: no token, never a throw.
  const failing = new Account({
    clientId: 'client_1',
    createAuthKit: (_, options) => {
      options.ipcMain.handle('authkit:get-access-token', async () => ({ ok: false, error: { code: 'X', message: 'no' } }))
      return { registerProtocol: () => undefined, cleanup: () => undefined }
    }
  })
  assert.equal(await failing.token(), null)

  // --- Every OpenAI call goes through the server, named by its feature. ---
  const through = []
  let answer = () => json({ error: { type: 'duet', code: 'usage_cap', cap: 'credits', resets_at: '2026-11-01T00:00:00.000Z' } }, 402, { 'x-should-retry': 'false' })
  useDuetServer({
    apiKey: 'duet',
    baseURL: 'https://api.useduet.io/v1',
    fetch: async (url, init) => {
      through.push({ url: String(url), feature: new Headers(init?.headers).get('x-duet-feature') })
      return answer(String(url), init)
    }
  })
  const env = {}
  const models = createModels(env)
  await assert.rejects(models.lines.processLines({ language: 'es', lines: ['Hola'], history: [] }), (error) => error instanceof ModelError && error.kind === 'quota')
  assert.deepEqual(through.at(-1), { url: 'https://api.useduet.io/v1/responses', feature: 'lines' }, 'lines go to the server as lines')
  assert.equal(through.length, 1, 'a cap is not tried again')
  const voice = createVoiceModels(env)
  const clip = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }
  await assert.rejects(voice.speechToText.transcribe(clip, 'es', undefined, { only: true }), (error) => error.kind === 'quota')
  assert.deepEqual(through.at(-1), { url: 'https://api.useduet.io/v1/audio/transcriptions', feature: 'hearing' }, 'a video is heard as hearing')
  await assert.rejects(voice.speechToText.transcribe(clip, 'es'), (error) => error.kind === 'quota')
  assert.equal(through.at(-1).feature, 'talk', 'the learner’s own voice is talk')
  await assert.rejects(voice.tts.speak('Hola', 'es'), (error) => error.kind === 'quota')
  assert.deepEqual(through.at(-1), { url: 'https://api.useduet.io/v1/audio/speech', feature: 'speech' })
  await assert.rejects(voice.coach.coach({ data: new Uint8Array([1]), mimeType: 'audio/wav' }, { original: 'Hola', language: 'es' }), (error) => error.kind === 'quota')
  assert.deepEqual(through.at(-1), { url: 'https://api.useduet.io/v1/chat/completions', feature: 'coach' })
  const quiz = textModel(env)
  assert.ok(quiz, 'the text model works through the server')
  await assert.rejects(quiz({ instructions: 'x', input: 'y', maxTokens: 10, context: 'Could not ask' }), /credits/)
  assert.equal(through.at(-1).feature, 'challenge')
  await assert.rejects(replyInText({ kind: 'free', language: 'es', level: 3 }, 'hola', async () => '', env), /credits/)
  assert.equal(through.at(-1).feature, 'tutor')
  answer = () => json({ session: { id: 'live_9' }, transport: { type: 'webrtc', sdp: 'v=0 answer' } })
  const live = await createLiveSession('v=0 offer', { kind: 'free', language: 'es', level: 3 }, env)
  assert.deepEqual(live, { sessionId: 'live_9', sdp: 'v=0 answer' })
  assert.deepEqual(through.at(-1), { url: 'https://api.useduet.io/v1/live/sessions', feature: 'tutor' })
  const signedOutError = Object.assign(new Error('401'), { status: 401, error: { type: 'duet', code: 'signed_out' } })
  assert.equal(safeLiveError(signedOutError, 'Could not start voice').message, 'Sign in to Duet to use this.')
  useDuetServer(undefined)
  assert.throws(() => createVoiceModels({}), /Sign in/, 'with no server and no key, the voice says to sign in')

  // --- Lines at the cap: failed with the reason on the strip, and not tried again. ---
  let asked = 0
  const cappedLines = new LineSession(
    {
      name: 'fake',
      async processLines() {
        asked++
        throw new ModelError('You’ve used this month’s Duet credits. More come on 1 November.', 'quota')
      }
    },
    'es'
  )
  const strip = []
  cappedLines.on('model-error', (message) => strip.push(message))
  cappedLines.add('Hola', Date.now())
  await settle()
  assert.equal(cappedLines.script.lines[0].state, 'failed')
  assert.match(strip.at(-1) ?? '', /credits/, 'the strip says why')
  await new Promise((done) => setTimeout(done, 30))
  assert.equal(asked, 1, 'no retry at a cap')

  console.log('Account tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
