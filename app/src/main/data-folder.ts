// Where Duet keeps its data (the database, settings, the browser session): the "app" folder in the
// system's app data folder, where it has been since the start. Electron would name the folder after
// the app, so the app being called Duet (package.json productName) must not move it.
import { join } from 'node:path'

const FOLDER = 'app'

/** The data folder, inside the system's app data folder (`app.getPath('appData')`). */
export function dataFolder(appData: string): string {
  return join(appData, FOLDER)
}
