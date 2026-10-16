// Fails when a committed Windows reader in resources/bin wasn't built from its source as it is now
// (see native-source.mjs). Run on Windows, before build:native replaces them. To fix it, build the
// readers on Windows (the Windows CI job uploads them) and commit them.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { root, sourceHash, WINDOWS_READERS } from './native-source.mjs'

if (process.platform !== 'win32') {
  console.log('The Windows readers can only be checked on Windows.')
  process.exit(0)
}

const stale = WINDOWS_READERS.filter(({ source, built }) => {
  const run = spawnSync(resolve(root, built), ['--source-hash'], { encoding: 'utf8' })
  return run.status !== 0 || run.stdout.trim() !== sourceHash(source)
})
for (const { source, built } of stale)
  console.error(`${built} wasn't built from ${source} as it is now.`)
if (stale.length) process.exit(1)
console.log('The committed Windows readers match their source.')
