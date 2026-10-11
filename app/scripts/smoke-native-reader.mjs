import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'win32') {
  console.log(`Windows caption-reader smoke test skipped on ${process.platform}.`)
  process.exit(0)
}

const executable = resolve(
  import.meta.dirname,
  '..',
  'resources',
  'bin',
  'caption-reader-windows.exe'
)
const result = spawnSync(executable, ['--self-test'], { encoding: 'utf8' })
if (result.error) throw result.error
if (result.status !== 0) throw new Error(result.stderr || `Caption reader exited ${result.status}.`)

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

console.log('Windows caption reader protocol smoke test passed.')
