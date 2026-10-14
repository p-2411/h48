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
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
const listeners = new Map()
const opened = []
module.exports = {
  app: { getPath: () => ${JSON.stringify(folder)} },
  is: { dev: false },
  ipcMain: { handle: (channel, work) => handlers.set(channel, work), on: (channel, work) => listeners.set(channel, work) },
  shell: { openExternal: (url) => (opened.push(url), Promise.resolve()) },
  handlers,
  listeners,
  opened
}
`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron }
})

const { openAIAccess, setDuetServer } = await jiti.import('../src/main/ai/access.ts')
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
const { connectAccount } = await jiti.import('../src/main/account/connect.ts')
const { usageSummary } = await jiti.import('../src/shared/usage.ts')
const electron = await jiti.import(fakeElectron)
const { Tutor } = await jiti.import('../src/main/tutor/index.ts')

const settle = () => new Promise((done) => setTimeout(done, 0))
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })

try {
  // --- How Duet reaches OpenAI. ---
  setDuetServer(undefined)
  assert.deepEqual(
    openAIAccess({ OPENAI_API_KEY: 'sk-dev' }),
    { apiKey: 'sk-dev' },
    'a development key goes straight to OpenAI'
  )
  assert.equal(openAIAccess({}), undefined, 'no key and no server: no access')
  const serverAccess = {
    apiKey: 'duet',
    baseURL: 'https://api.useduet.io/v1',
    fetch: async () => json({})
  }
  setDuetServer(serverAccess)
  assert.equal(
    openAIAccess({}),
    serverAccess,
    'otherwise Duet’s server, with the learner’s sign-in'
  )
  assert.equal(
    openAIAccess({ OPENAI_API_KEY: 'sk-dev', DUET_API_URL: 'http://localhost:8787/v1' }),
    serverAccess,
    'DUET_API_URL makes a development build use the server even with a key'
  )
  setDuetServer(undefined)

  // --- The device id: a hash of the hardware id, never the id itself. ---
  const mac = hardwareId(
    'darwin',
    () => '  "IOPlatformUUID" = "1234-ABCD"\n',
    () => ''
  )
  assert.equal(mac, '1234-ABCD', 'the Mac’s platform UUID')
  assert.equal(
    hardwareId(
      'linux',
      () => '',
      () => 'abc123\n'
    ),
    'abc123',
    'Linux’s machine id'
  )
  assert.equal(
    hardwareId(
      'win32',
      () => '    MachineGuid    REG_SZ    9f-88\r\n',
      () => ''
    ),
    '9f-88',
    'Windows’ machine GUID'
  )
  assert.equal(
    hardwareId(
      'darwin',
      () => {
        throw new Error('no ioreg')
      },
      () => ''
    ),
    undefined,
    'none found: undefined'
  )
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
    error: {
      type: 'duet',
      code: 'usage_cap',
      cap: 'credits',
      resets_at: '2026-11-01T00:00:00.000Z'
    }
  })
  const quota = duetModelError(capError)
  assert.ok(quota instanceof ModelError)
  assert.equal(quota.kind, 'quota', 'a cap is its own kind: not tried again')
  assert.match(quota.message, /credits/)
  const signedOut = duetModelError(
    Object.assign(new Error('401'), { status: 401, error: { type: 'duet', code: 'signed_out' } })
  )
  assert.equal(signedOut.kind, 'auth')
  assert.equal(signedOut.message, 'Sign in to Duet to use this.')
  assert.equal(
    duetModelError(Object.assign(new Error('429'), { status: 429, error: { message: 'busy' } })),
    undefined,
    'OpenAI’s own errors are left alone'
  )

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
  await server.openAIFetch('https://api.useduet.io/v1/responses', {
    method: 'POST',
    headers: { authorization: 'Bearer duet', 'x-duet-feature': 'explain' },
    body: '{}'
  })
  assert.equal(
    sent[0].headers.get('authorization'),
    'Bearer tok-1',
    'the learner’s token replaces the placeholder key'
  )
  assert.equal(sent[0].headers.get('x-duet-device'), 'd'.repeat(64))
  assert.equal(sent[0].headers.get('x-duet-feature'), 'explain', 'the call’s own headers stay')
  assert.equal(sent[0].headers.get('x-duet-watch'), null, 'no watch session yet')

  // Signed out: no request leaves; the SDK gets a 401 it will not retry.
  token = null
  const events = []
  server.on('signed-out', () => events.push('signed-out'))
  server.on('cap', (error) => events.push(['cap', error.cap]))
  const before = sent.length
  const out = await server.openAIFetch('https://api.useduet.io/v1/responses', {
    method: 'POST',
    body: '{}'
  })
  assert.equal(out.status, 401)
  assert.equal(out.headers.get('x-should-retry'), 'false')
  assert.equal((await out.json()).error.code, 'signed_out')
  assert.equal(sent.length, before, 'nothing is sent signed out')
  assert.deepEqual(events, ['signed-out'])
  token = 'tok-2'

  // A cap reply is passed on and announced, so the app can show it everywhere.
  reply = () =>
    json(
      {
        error: {
          type: 'duet',
          code: 'usage_cap',
          cap: 'hours',
          resets_at: '2026-10-19T00:00:00.000Z'
        }
      },
      402
    )
  const capped = await server.openAIFetch('https://api.useduet.io/v1/responses', {
    method: 'POST',
    body: '{}'
  })
  assert.equal(capped.status, 402)
  assert.deepEqual(events.at(-1), ['cap', 'hours'])

  // Lines without a watch session: the server asks for one; Duet opens it and tries once more.
  const order = []
  reply = (url, init) => {
    if (url.endsWith('/duet/watch/start'))
      return (order.push('start'), json({ id: 'w1', beatEveryMs: 30000 }))
    const watch = new Headers(init.headers).get('x-duet-watch')
    order.push(watch ?? 'none')
    return watch
      ? json({ id: 'resp' })
      : json({ error: { type: 'duet', code: 'watch_required' } }, 409)
  }
  const retried = await server.openAIFetch('https://api.useduet.io/v1/responses', {
    method: 'POST',
    body: '{"a":1}'
  })
  assert.equal(retried.status, 200)
  assert.deepEqual(
    order,
    ['none', 'start', 'w1'],
    'watch session opened, then the call again with it'
  )
  assert.equal(server.watchId, 'w1')

  // Duet's own routes: JSON in and out; errors carry the server's code.
  reply = () => json({ plan: 'free' })
  assert.deepEqual(await server.request('/duet/me', undefined, 'GET'), { plan: 'free' })
  assert.equal(sent.at(-1).url, 'https://api.useduet.io/v1/duet/me')
  reply = () =>
    json({ error: { type: 'duet', code: 'billing', message: 'Payments are not set up yet.' } }, 503)
  await assert.rejects(
    server.request('/duet/billing/checkout', {}),
    (error) => error instanceof DuetServerError && error.code === 'billing' && error.status === 503
  )

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
  assert.deepEqual(
    calls,
    ['start', '/duet/watch/w9/beat', '/duet/watch/w9/end'],
    'stopping ends it'
  )
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

  // Starts refused (the hours cap): asked again after 10 s, then 20 s, 40 s… not every 10 s.
  const starts = []
  const capServer = {
    watchId: undefined,
    openWatch: async () => (starts.push('start'), undefined),
    request: async () => ({ ok: true }),
    forgetWatch: () => undefined
  }
  const cappedWatch = new ServerWatch(capServer)
  for (const at of [0, 5_000, 10_000, 20_000, 30_000, 40_000, 70_000, 71_000]) {
    cappedWatch.tick(true, at)
    await settle()
  }
  assert.deepEqual(
    starts.length,
    4,
    `asked at 0, 10 s, 30 s and 70 s (asked ${starts.length} times)`
  )

  // --- Live voice minutes. ---
  const minutes = []
  const stops = []
  let minuteReply = { stop: false }
  const meter = new LiveMeter(
    {
      request: async (path) => (
        minutes.push(path),
        path.endsWith('/minute') ? minuteReply : { ok: true }
      )
    },
    (sentence) => stops.push(sentence),
    5
  )
  meter.started('live_1')
  await new Promise((done) => setTimeout(done, 12))
  assert.ok(
    minutes.filter((path) => path === '/duet/live/live_1/minute').length >= 1,
    'a minute call while the call is open'
  )
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
  assert.ok(
    !minutes.includes('/duet/live/live_2/end'),
    'a call the server ended is not ended again'
  )

  // --- The WorkOS wrapper: the SDK's handlers are kept in main; no window can call them. ---
  let config
  const changes = []
  const handled = new Map()
  const fakeAuthKit = (given, options) => {
    config = given
    options.ipcMain.handle('authkit:get-access-token', async () => ({ ok: true, data: 'access-1' }))
    options.ipcMain.handle('authkit:get-user', async () => ({
      ok: true,
      data: { user: { email: 'a@example.com' } }
    }))
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
      options.ipcMain.handle('authkit:get-access-token', async () => ({
        ok: false,
        error: { code: 'X', message: 'no' }
      }))
      return { registerProtocol: () => undefined, cleanup: () => undefined }
    }
  })
  assert.equal(await failing.token(), null)

  // --- Every OpenAI call goes through the server, named by its feature. ---
  const through = []
  let answer = () =>
    json(
      {
        error: {
          type: 'duet',
          code: 'usage_cap',
          cap: 'credits',
          resets_at: '2026-11-01T00:00:00.000Z'
        }
      },
      402,
      { 'x-should-retry': 'false' }
    )
  setDuetServer({
    apiKey: 'duet',
    baseURL: 'https://api.useduet.io/v1',
    fetch: async (url, init) => {
      through.push({ url: String(url), feature: new Headers(init?.headers).get('x-duet-feature') })
      return answer(String(url), init)
    }
  })
  const env = {}
  const models = createModels(env)
  await assert.rejects(
    models.lines.processLines({ language: 'es', lines: ['Hola'], history: [] }),
    (error) => error instanceof ModelError && error.kind === 'quota'
  )
  assert.deepEqual(
    through.at(-1),
    { url: 'https://api.useduet.io/v1/responses', feature: 'lines' },
    'lines go to the server as lines'
  )
  assert.equal(through.length, 1, 'a cap is not tried again')
  const voice = createVoiceModels(env)
  const clip = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm' }
  await assert.rejects(
    voice.speechToText.transcribe(clip, 'es', undefined, { only: true }),
    (error) => error.kind === 'quota'
  )
  assert.deepEqual(
    through.at(-1),
    { url: 'https://api.useduet.io/v1/audio/transcriptions', feature: 'hearing' },
    'a video is heard as hearing'
  )
  await assert.rejects(voice.speechToText.transcribe(clip, 'es'), (error) => error.kind === 'quota')
  assert.equal(through.at(-1).feature, 'talk', 'the learner’s own voice is talk')
  await assert.rejects(voice.tts.speak('Hola', 'es'), (error) => error.kind === 'quota')
  assert.deepEqual(through.at(-1), {
    url: 'https://api.useduet.io/v1/audio/speech',
    feature: 'speech'
  })
  await assert.rejects(
    voice.coach.coach(
      { data: new Uint8Array([1]), mimeType: 'audio/wav' },
      { original: 'Hola', language: 'es' }
    ),
    (error) => error.kind === 'quota'
  )
  assert.deepEqual(through.at(-1), {
    url: 'https://api.useduet.io/v1/chat/completions',
    feature: 'coach'
  })
  const quiz = textModel(env)
  assert.ok(quiz, 'the text model works through the server')
  await assert.rejects(
    quiz({ instructions: 'x', input: 'y', maxTokens: 10, context: 'Could not ask' }),
    /credits/
  )
  assert.equal(through.at(-1).feature, 'challenge')
  await assert.rejects(
    replyInText({ kind: 'free', language: 'es', level: 3 }, 'hola', async () => '', env),
    /credits/
  )
  assert.equal(through.at(-1).feature, 'tutor')
  answer = () =>
    json({ session: { id: 'live_9' }, transport: { type: 'webrtc', sdp: 'v=0 answer' } })
  const live = await createLiveSession('v=0 offer', { kind: 'free', language: 'es', level: 3 }, env)
  assert.deepEqual(live, { sessionId: 'live_9', sdp: 'v=0 answer' })
  assert.deepEqual(through.at(-1), {
    url: 'https://api.useduet.io/v1/live/sessions',
    feature: 'tutor'
  })
  const signedOutError = Object.assign(new Error('401'), {
    status: 401,
    error: { type: 'duet', code: 'signed_out' }
  })
  assert.equal(
    safeLiveError(signedOutError, 'Could not start voice').message,
    'Sign in to Duet to use this.'
  )

  // The tutor tells the live meter when a call starts and ends, and passes a stop to its window.
  const meterCalls = []
  const tutor = new Tutor(
    { hold: () => undefined, release: () => undefined },
    { resetTutorReview: () => undefined },
    undefined,
    { started: (id) => meterCalls.push(['started', id]), ended: () => meterCalls.push(['ended']) }
  )
  const voiceWindow = {
    sent: [],
    owns: (sender) => sender === 'panel-page',
    send: (channel, value) => voiceWindow.sent.push([channel, value])
  }
  tutor.open({ kind: 'free', language: 'es', level: 3 }, voiceWindow)
  const answered = await electron.handlers.get('tutor:start-session')(
    { sender: 'panel-page' },
    { sdp: 'v=0 offer' }
  )
  assert.equal(answered.sessionId, 'live_9')
  assert.deepEqual(meterCalls.at(-1), ['started', 'live_9'], 'the meter starts with the call')
  tutor.stopVoice('You’ve used this month’s Duet credits. More come on 1 November.')
  assert.deepEqual(voiceWindow.sent.at(-1), [
    'tutor:voice-stop',
    'You’ve used this month’s Duet credits. More come on 1 November.'
  ])
  electron.listeners.get('tutor:voice-ended')({ sender: 'panel-page' })
  assert.deepEqual(meterCalls.at(-1), ['ended'], 'and ends with it')
  electron.handlers.clear()

  setDuetServer(undefined)
  assert.throws(
    () => createVoiceModels({}),
    /Sign in/,
    'with no server and no key, the voice says to sign in'
  )

  // --- Lines at the cap: failed with the reason on the strip, and not tried again. ---
  let asked = 0
  const cappedLines = new LineSession(
    {
      name: 'fake',
      async processLines() {
        asked++
        throw new ModelError(
          'You’ve used this month’s Duet credits. More come on 1 November.',
          'quota'
        )
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

  // --- What the home base shows of the plan. ---
  const usage = {
    plan: 'free',
    freeBlocked: false,
    credits: { used: 54.5, cap: 200, resetsAt: '2026-11-01T00:00:00.000Z' },
    hours: { usedMs: 72 * 60_000, capMs: 2 * 3600_000, resetsAt: '2026-10-19T00:00:00.000Z' },
    billing: true
  }
  assert.deepEqual(usageSummary(usage, 'UTC'), {
    plan: 'Free',
    hours: {
      label: '1 h 12 min of 2 h this week',
      fraction: 0.6,
      resets: 'More on Monday 19 October'
    },
    credits: {
      label: '54 of 200 credits this month',
      fraction: 0.2725,
      resets: 'More on 1 November'
    }
  })
  const paid = usageSummary(
    { ...usage, plan: 'paid', hours: { ...usage.hours, usedMs: 0, capMs: 40 * 3600_000 } },
    'UTC'
  )
  assert.equal(paid.plan, 'Paid')
  assert.equal(paid.hours.label, '0 min of 40 h this month')

  // --- The account in the home base: state, sign-in, sign-out, upgrade, through main only. ---
  const homeSent = []
  const home = {
    owns: (sender) => sender === 'home-page',
    send: (channel, value) => homeSent.push([channel, value])
  }
  let me = usage
  const routes = []
  const accountEvents = new (await import('node:events')).EventEmitter()
  let signedIn = { email: 'a@example.com' }
  const fakeAccount = Object.assign(accountEvents, {
    user: async () => signedIn,
    signIn: async () => routes.push('sign-in'),
    signOut: async () => ((signedIn = null), routes.push('sign-out'))
  })
  const serverEvents = new (await import('node:events')).EventEmitter()
  const fakeDuet = Object.assign(serverEvents, {
    request: async (path) => {
      routes.push(path)
      if (path === '/duet/me') return me
      if (path === '/duet/billing/checkout') return { url: 'https://checkout.stripe.com/c/pay_1' }
      if (path === '/duet/billing/portal') return { url: 'https://billing.stripe.com/p/1' }
      throw new Error('unknown')
    }
  })
  const link = connectAccount({ account: fakeAccount, server: fakeDuet, home })
  const ask = (channel, sender = 'home-page') => electron.handlers.get(channel)({ sender })
  await assert.rejects(ask('account:get', 'strip-page'), /home/, 'only the home page may ask')
  const state = await ask('account:get')
  assert.deepEqual(state, {
    configured: true,
    user: { email: 'a@example.com' },
    usage,
    capped: undefined
  })
  await ask('account:upgrade')
  assert.equal(
    electron.opened.at(-1),
    'https://checkout.stripe.com/c/pay_1',
    'Upgrade opens Stripe Checkout in the browser'
  )
  await ask('account:manage')
  assert.equal(electron.opened.at(-1), 'https://billing.stripe.com/p/1')
  // A cap reply anywhere: the home base hears it with the sentence, and the meters are asked again.
  serverEvents.emit('cap', { cap: 'credits', resets_at: '2026-11-01T00:00:00.000Z' })
  await settle()
  await settle()
  const capState = homeSent.filter(([channel]) => channel === 'account:changed').at(-1)[1]
  assert.match(capState.capped, /credits/)
  // Signing out empties the meters; the page hears it.
  await ask('account:sign-out')
  accountEvents.emit('change', null)
  await settle()
  await settle()
  const afterSignOut = homeSent.filter(([channel]) => channel === 'account:changed').at(-1)[1]
  assert.deepEqual(afterSignOut, { configured: true, user: null, usage: null, capped: undefined })
  // Signing in again asks for the meters at once.
  signedIn = { email: 'a@example.com' }
  me = { ...usage, plan: 'paid' }
  accountEvents.emit('change', signedIn)
  await settle()
  await settle()
  assert.equal(
    homeSent.filter(([channel]) => channel === 'account:changed').at(-1)[1].usage.plan,
    'paid'
  )
  // The server refusing the sign-in (a session revoked at WorkOS): the home base shows signed out,
  // without asking the server again.
  const requestsBefore = routes.length
  serverEvents.emit('signed-out')
  await settle()
  const refused = homeSent.filter(([channel]) => channel === 'account:changed').at(-1)[1]
  assert.deepEqual(refused, { configured: true, user: null, usage: null, capped: undefined })
  assert.equal(routes.length, requestsBefore, 'no request on a sign-out the server reported')
  link.stop()

  // Without sign-in set up (a development key, or a build with no WorkOS client id).
  electron.handlers.clear()
  connectAccount({ home })
  assert.deepEqual(await ask('account:get'), {
    configured: false,
    user: null,
    usage: null,
    capped: undefined
  })

  console.log('Account tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
