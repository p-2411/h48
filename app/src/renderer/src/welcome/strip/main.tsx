// The real caption strip (Overlay.tsx with its own styles), framed on the first run's video. Its
// window.duet is a stand-in that sends each call to the first run's page (bridge.ts), whose demo
// answers it; the strip itself runs exactly as in its own window.
import '../../styles/base.css'
import '../../overlay/overlay.css'

import { isBridgeMessage, type FromStrip, type ToStrip } from './bridge'

let next = 0
const calls = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
const listeners = new Map<number, (value: unknown) => void>()
const post = (message: FromStrip): void => window.parent.postMessage(message, '*')

addEventListener('message', (event) => {
  if (event.source !== window.parent || !isBridgeMessage(event.data)) return
  const message = event.data as ToStrip
  if (message.duetStrip === 'event') listeners.get(message.sub)?.(message.value)
  else if (message.duetStrip === 'result') {
    const call = calls.get(message.id)
    calls.delete(message.id)
    if (message.ok) call?.resolve(message.value)
    else call?.reject(new Error(message.error))
  }
})

/** window.duet, as a path of names: calling `on…` subscribes, anything else asks the page. */
function api(path: string[]): unknown {
  return new Proxy(() => undefined, {
    get: (_, key) => {
      if (typeof key === 'symbol' || key === 'then') return undefined
      // Values, not calls: the demo asks for no permissions.
      if (path.join('.') === 'welcome' && key === 'asksPermissions') return false
      return api([...path, key])
    },
    apply: (_, __, args: unknown[]) => {
      if (/^on[A-Z]/.test(path[path.length - 1] ?? '')) {
        const sub = ++next
        listeners.set(sub, args[0] as (value: unknown) => void)
        post({ duetStrip: 'on', sub, path })
        return () => {
          listeners.delete(sub)
          post({ duetStrip: 'off', sub })
        }
      }
      const id = ++next
      return new Promise((resolve, reject) => {
        calls.set(id, { resolve, reject })
        try {
          post({ duetStrip: 'call', id, path, args })
        } catch (error) {
          calls.delete(id)
          reject(error)
        }
      })
    }
  })
}
;(window as unknown as { duet: unknown }).duet = api([])

// The strip itself, once window.duet is in place.
const [{ StrictMode, createElement }, { createRoot }, { MotionRoot }, { Overlay }] = await Promise.all([
  import('react'),
  import('react-dom/client'),
  import('../../components/motion'),
  import('../../overlay/Overlay')
])
createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(MotionRoot, null, createElement(Overlay)))
)
