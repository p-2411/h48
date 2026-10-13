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
} else {
  console.log(`No native readers on ${process.platform}.`)
}
