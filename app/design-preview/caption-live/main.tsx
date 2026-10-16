// Mounts the real caption window in a shadow root, with its own CSS (and the mascot's) inside it.
import base from '../../src/renderer/src/styles/base.css?inline'
import overlay from '../../src/renderer/src/overlay/overlay.css?inline'
import duet from '../../src/renderer/src/components/duet/duet.css?inline'
import settings from '../../src/renderer/src/components/settings.css?inline'
import { mountOverlay } from '../duet-merged/real-overlay'

const demo = mountOverlay(document.getElementById('host')!, base + settings + overlay + duet)
setTimeout(() => demo.showLine(true), 300)
;(window as unknown as { demo: typeof demo }).demo = demo
