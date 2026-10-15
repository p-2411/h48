// Where Duet keeps its data (the database, settings, the browser session): the "app" folder in the
// system's app data folder, where it has been since the start. Electron would name the folder after
// the app, so the app being called Duet (package.json productName) must not move it.
import { join } from 'node:path'

const FOLDER = 'app'
// Windows had no Duet before its release, so its data can have Duet's own name from the start
// (%APPDATA%\Duet), not a folder named "app" that another app could also use.
const WINDOWS_FOLDER = 'Duet'

/** The data folder, inside the system's app data folder (`app.getPath('appData')`). */
export function dataFolder(appData: string, platform: NodeJS.Platform = process.platform): string {
  return join(appData, platform === 'win32' ? WINDOWS_FOLDER : FOLDER)
}
