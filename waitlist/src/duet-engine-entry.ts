// The app's mascot engine, for the site: window.DuetEngine.createDuet (one Duet for the whole page).
import '../../app/src/renderer/src/components/duet/duet.css'
import { createDuet } from '../../app/src/renderer/src/components/duet/engine'
;(window as unknown as { DuetEngine: unknown }).DuetEngine = { createDuet }
