// Imported first by index.ts, before anything else can read the data folder: the data stays where it
// has always been ("app", data-folder.ts), whatever the app is called. A folder given on the command
// line (--user-data-dir, a test or preview copy) is kept.
import { app } from 'electron'
import { dataFolder } from './data-folder'

if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', dataFolder(app.getPath('appData')))
