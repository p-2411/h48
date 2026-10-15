// The native readers, run for real (so not part of `npm test`: on the Mac they need the
// Accessibility permission, or they ask for it). Checks the protocol (Windows: its self-test) and
// that every reader exits once the app has gone (its stdin closes), so none is left running.
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const bin = (name) => resolve(import.meta.dirname, '..', 'resources', 'bin', name)

/** Starts a reader, closes its stdin as a quitting app does, and fails if it is still running after `ms`. */
async function exitsWhenAppGoes(name, ms = 2000) {
  const child = spawn(bin(name), [], { stdio: ['pipe', 'ignore', 'ignore'] })
  // Let it start up (and reach its run loop) before the app "goes".
  await new Promise((done) => setTimeout(done, 500))
  const exited = new Promise((done) => child.once('exit', () => done(true)))
  child.stdin.end()
  const gone = await Promise.race([
    exited,
    new Promise((done) => setTimeout(() => done(false), ms))
  ])
  if (!gone) {
    child.kill()
    throw new Error(`${name} kept running after the app went (its stdin closed).`)
  }
}

if (process.platform === 'darwin') {
  // Its self-test checks which addresses count as a site's (no browser, no permission needed).
  const check = spawnSync(bin('caption-reader-macos'), ['--self-test'], {
    encoding: 'utf8',
    timeout: 3000
  })
  if (check.status !== 0 || !check.stdout.includes('"type":"self-test"'))
    throw new Error(`caption-reader-macos self-test failed: ${check.stdout}${check.stderr}`)
  await exitsWhenAppGoes('caption-reader-macos')
  await exitsWhenAppGoes('audio-reader-macos')
  console.log('macOS readers exit when the app goes.')
} else if (process.platform === 'win32') {
  const result = spawnSync(bin('caption-reader-windows.exe'), ['--self-test'], {
    encoding: 'utf8'
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(result.stderr || `Caption reader exited ${result.status}.`)

  const events = result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line))

  for (const type of ['status', 'caption', 'time']) {
    if (!events.some((event) => event.type === type))
      throw new Error(`Windows caption reader self-test did not emit ${type}.`)
  }
  if (!events.some((event) => event.type === 'caption' && event.text === 'こんにちは'))
    throw new Error('Windows caption reader did not preserve UTF-8 caption text.')
  await exitsWhenAppGoes('caption-reader-windows.exe')
  console.log('Windows caption reader protocol smoke test passed, and it exits when the app goes.')

  // The audio reader's self-test records two half seconds of a tone, one second apart, in each
  // format Windows may hand over (16 kHz mono, else 44.1 kHz stereo), and clips all of it: two
  // seconds at 16 kHz, with the gap kept as silence.
  const audio = spawnSync(bin('audio-reader-windows.exe'), ['--self-test'], { encoding: 'utf8' })
  if (audio.error) throw audio.error
  if (audio.status !== 0) throw new Error(audio.stderr || `Audio reader exited ${audio.status}.`)
  const test = JSON.parse(audio.stdout.trim().split(/\r?\n/u).at(-1))
  if (test.type !== 'self-test' || test.formats?.length !== 2)
    throw new Error(`Windows audio reader self-test failed: ${audio.stdout}`)
  for (const format of test.formats) {
    // Resampling from 44.1 kHz may land a sample either side.
    if (Math.abs(format.samples - 32000) > (format.rate === 16000 ? 0 : 160))
      throw new Error(
        `Windows audio reader kept ${format.samples} samples at ${format.rate} Hz, not 32000.`
      )
    if (
      !(format.level > 0.2) ||
      format.gapLevel !== 0 ||
      format.wavBytes !== 44 + format.samples * 2
    )
      throw new Error(
        `Windows audio reader self-test failed at ${format.rate} Hz: ${JSON.stringify(format)}`
      )
  }
  // Started for real, it reports its status at once (no device needed for that) and needs no
  // permission (Windows Server, as on CI, has process loopback too).
  const reader = spawn(bin('audio-reader-windows.exe'), [], { stdio: ['pipe', 'pipe', 'inherit'] })
  const first = await new Promise((done, fail) => {
    reader.stdout.once('data', (chunk) => done(JSON.parse(String(chunk).split('\n')[0])))
    setTimeout(() => fail(new Error('Windows audio reader sent no status.')), 3000)
  })
  reader.kill()
  if (first.type !== 'status' || first.permission !== 'granted')
    throw new Error(`Windows audio reader's first status: ${JSON.stringify(first)}`)
  await exitsWhenAppGoes('audio-reader-windows.exe')
  console.log('Windows audio reader self-test passed, and it exits when the app goes.')
} else {
  console.log(`No native readers on ${process.platform}.`)
}
