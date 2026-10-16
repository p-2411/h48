// The app's new mascot engine, exposed for the landing page design: window.DuetEngine.createDuet.
import '../../../../app/src/renderer/src/components/duet/duet.css'
import { createDuet } from '../../../../app/src/renderer/src/components/duet/engine'
;(window as unknown as { DuetEngine: unknown }).DuetEngine = { createDuet }
