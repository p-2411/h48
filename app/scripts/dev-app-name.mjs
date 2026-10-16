// Names the development app Duet on macOS. `npm run dev` runs the stock Electron.app from
// node_modules, and the Dock, the app switcher and the menu bar take its name from that bundle's
// Info.plist, not from app.setName. Packaged builds are named by electron-builder (productName).
//   Runs before `npm run dev` and after `npm install`. Electron's binary is linker-signed, which
// does not cover Info.plist, so the signature, and the permissions macOS gave it, stay as they are.
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const NAME = 'Duet'
const app = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../node_modules/electron/dist/Electron.app'
)
const plist = resolve(app, 'Contents/Info.plist')

if (process.platform === 'darwin' && existsSync(plist)) {
  const read = (key) => {
    try {
      return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], {
        encoding: 'utf8'
      }).trim()
    } catch {
      return undefined
    }
  }
  const keys = ['CFBundleName', 'CFBundleDisplayName'].filter((key) => read(key) !== NAME)
  if (keys.length > 0) {
    for (const key of keys) execFileSync('plutil', ['-replace', key, '-string', NAME, plist])
    // Launch Services caches bundle names; register the bundle again so the Dock reads the new one.
    const lsregister =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
    try {
      execFileSync(lsregister, ['-f', app])
    } catch {
      // Not fatal: the name shows after the next login instead.
    }
    console.log(`dev app named ${NAME}`)
  }
}
