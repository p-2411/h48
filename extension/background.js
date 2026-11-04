// Carries each YouTube tab's reports to the Duet app, and the app's commands back. One WebSocket per
// tab, so the app always knows which page a report came from and where to send a command.
// The app listens on 127.0.0.1 only (app/src/main/page-link.ts, same port). When Duet isn't
// running, reports are dropped and the connection is tried again every few seconds.
'use strict'

const APP = 'ws://127.0.0.1:47821'
const RETRY_MS = 2000

chrome.runtime.onConnect.addListener((page) => {
  if (page.name !== 'duet-page') return
  let socket
  let retry
  let closed = false
  let latest

  const open = () => {
    if (closed) return
    socket = new WebSocket(APP)
    socket.onopen = () => latest && socket.send(latest)
    socket.onmessage = (event) => {
      try {
        page.postMessage(JSON.parse(event.data))
      } catch {}
    }
    socket.onclose = () => {
      socket = undefined
      if (!closed) retry = setTimeout(open, RETRY_MS)
    }
    socket.onerror = () => socket?.close()
  }

  page.onMessage.addListener((message) => {
    latest = JSON.stringify(message)
    if (socket?.readyState === WebSocket.OPEN) socket.send(latest)
  })
  page.onDisconnect.addListener(() => {
    closed = true
    clearTimeout(retry)
    socket?.close()
  })
  open()
})
