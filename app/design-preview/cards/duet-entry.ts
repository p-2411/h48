// The real mascot engine for the flashcards design (docs/design/cards/duet-flashcards.html).
import '../../src/renderer/src/components/duet/duet.css'
import { createDuet } from '../../src/renderer/src/components/duet/engine'
;(window as unknown as { createDuet: typeof createDuet }).createDuet = createDuet
