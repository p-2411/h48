// Duet's own updates (src/main/updates): what each of electron-updater's events makes of the state,
// what the menu bar and Settings say about it, and that nothing is looked for when updates are off.
// Run: npx jiti scripts/test-updates.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJiti } from 'jiti'

// Electron, its helpers and electron-updater are stand-ins here: a fake updater is given instead.
const folder = mkdtempSync(join(tmpdir(), 'duet-updates-'))
const fake = join(folder, 'electron.cjs')
writeFileSync(
  fake,
  "module.exports = { app: { isPackaged: true, getVersion: () => '1.0.0' }, is: { dev: false }, autoUpdater: {} }\n"
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fake, '@electron-toolkit/utils': fake, 'electron-updater': fake }
})
const { Updates } = await jiti.import('../src/main/updates/index.ts')
const { updateLine, updateMenuItem } = await jiti.import('../src/shared/updates.ts')

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checks = 0
  installs = 0
  // What a check answers: its download, when one was found (a rejection here is a failed download).
  result = null
  async checkForUpdates() {
    this.checks++
    return this.result
  }
  quitAndInstall() {
    this.installs++
  }
}

function make({ enabled = true } = {}) {
  const updater = new FakeUpdater()
  const told = []
  const changes = []
  const updates = new Updates({
    enabled,
    version: '1.0.0',
    notify: (text) => told.push(text),
    updater: () => updater
  })
  updates.on('change', (status) => changes.push(status.state))
  return { updates, updater, told, changes }
}

const originalWarn = console.warn
console.warn = () => {}
try {
  // --- Off: no updater, no checks, no menu item. ---
  {
    const { updates, updater } = make({ enabled: false })
    assert.equal(updates.status.state.kind, 'off')
    updates.check()
    updates.restart()
    assert.equal(updater.checks, 0)
    assert.equal(updater.installs, 0)
    assert.equal(updateMenuItem(updates.status.state), undefined)
  }

  // --- On: downloads and installs on quit; a found update is downloaded, then ready. ---
  {
    const { updates, updater, told, changes } = make()
    assert.equal(updater.autoDownload, true)
    assert.equal(updater.autoInstallOnAppQuit, true)
    assert.deepEqual(updates.status, { version: '1.0.0', state: { kind: 'idle', checked: false } })
    assert.equal(updateLine(updates.status.state), 'Duet looks for updates on its own.')

    updates.check()
    assert.equal(updater.checks, 1)
    updater.emit('checking-for-update')
    assert.equal(updates.status.state.kind, 'checking')
    // A second check while one is under way does nothing.
    updates.check()
    assert.equal(updater.checks, 1)

    updater.emit('update-available', { version: '1.0.1' })
    assert.deepEqual(updates.status.state, { kind: 'downloading', version: '1.0.1', percent: 0 })
    assert.deepEqual(updateMenuItem(updates.status.state), {
      label: 'Downloading Duet 1.0.1…',
      enabled: false
    })
    // Progress is told at each whole percent only.
    const before = changes.length
    updater.emit('download-progress', { percent: 0.4 })
    updater.emit('download-progress', { percent: 12.2 })
    updater.emit('download-progress', { percent: 12.9 })
    assert.equal(changes.length, before + 1)
    assert.equal(Math.floor(updates.status.state.percent), 12)
    // The sentence leaves the percent out, so it isn't read aloud at each one (Settings shows it).
    assert.equal(updateLine(updates.status.state), 'Downloading Duet 1.0.1…')

    updater.emit('update-downloaded', { version: '1.0.1' })
    assert.deepEqual(updates.status.state, { kind: 'ready', version: '1.0.1' })
    assert.deepEqual(updateMenuItem(updates.status.state), {
      label: 'Restart to update to 1.0.1',
      enabled: true
    })
    // Nothing more is looked for once one is ready; restarting installs it.
    updates.check()
    assert.equal(updater.checks, 1)
    updates.restart()
    assert.equal(updater.installs, 1)
    // Background checks tell nobody.
    assert.deepEqual(told, [])
  }

  // --- Asked from the menu bar: the answer is a notification, once. ---
  {
    const { updates, updater, told } = make()
    updates.check({ tell: true })
    updater.emit('checking-for-update')
    updater.emit('update-not-available', { version: '1.0.0' })
    assert.deepEqual(updates.status.state, { kind: 'idle', checked: true })
    assert.equal(updateLine(updates.status.state), 'Duet is up to date.')
    assert.deepEqual(told, ['Duet is up to date.'])
    // A background check afterwards tells nobody.
    updates.check()
    updater.emit('update-not-available', { version: '1.0.0' })
    assert.equal(told.length, 1)
    // Restart does nothing without a downloaded update.
    updates.restart()
    assert.equal(updater.installs, 0)
  }

  // --- Failures: said plainly, and checked again later. ---
  {
    const { updates, updater, told } = make()
    updates.check({ tell: true })
    updater.emit('checking-for-update')
    updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    assert.deepEqual(updates.status.state, {
      kind: 'failed',
      message: 'Couldn’t look for updates. Duet will try again later.'
    })
    assert.deepEqual(told, ['Couldn’t look for updates. Duet will try again later.'])
    assert.deepEqual(updateMenuItem(updates.status.state), {
      label: 'Check for updates',
      enabled: true
    })

    updates.check()
    assert.equal(updater.checks, 2)
    updater.emit('update-available', { version: '1.0.2' })
    updater.emit('error', new Error('sha512 checksum mismatch'))
    assert.equal(
      updates.status.state.message,
      'Couldn’t download the update. Duet will try again later.'
    )
  }

  // --- A failed download is caught (no unhandled rejection), and said through 'error'. ---
  {
    const { updates, updater } = make()
    let rejected = false
    process.once('unhandledRejection', () => (rejected = true))
    updater.result = { downloadPromise: Promise.reject(new Error('download failed')) }
    updates.check()
    await new Promise((done) => setTimeout(done, 10))
    assert.equal(rejected, false, 'a failed download went unhandled')
  }

  // --- A ready update that can't be installed (run from the disk image): its own message, and
  // checks start again. ---
  {
    const { updates, updater } = make()
    updates.start()
    updates.check()
    updater.emit('update-available', { version: '1.0.1' })
    updater.emit('update-downloaded', { version: '1.0.1' })
    updater.emit('error', new Error('Cannot update while running on a read-only volume'))
    assert.match(updates.status.state.message, /Move Duet to your Applications folder/)
    updates.check()
    assert.equal(updater.checks, 2)
    updates.stop()
  }

  // --- What Settings says when updates are off. ---
  assert.equal(
    updateLine({ kind: 'off', reason: 'dev' }),
    'Updates are off while Duet runs from source.'
  )
  assert.match(updateLine({ kind: 'off', reason: 'unsupported' }), /useduet\.io/)

  console.log('updates: ok')
} finally {
  console.warn = originalWarn
  rmSync(folder, { recursive: true, force: true })
}
