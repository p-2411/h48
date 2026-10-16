// Picks the sea glass look from ?look= and adds a small switcher (preview only).
const LOOKS = ['current', 'wash', 'light', 'pebble']
const params = new URLSearchParams(location.search)
const set = (look) => {
  if (look === 'current') delete document.documentElement.dataset.look
  else document.documentElement.dataset.look = look
  params.set('look', look)
  history.replaceState(null, '', `?${params}`)
  document.querySelectorAll('#look-switch button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.look === look))
}
addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div')
  bar.id = 'look-switch'
  for (const look of LOOKS) {
    const b = document.createElement('button')
    b.textContent = look
    b.dataset.look = look
    b.onclick = () => set(look)
    bar.append(b)
  }
  document.body.append(bar)
  set(LOOKS.includes(params.get('look')) ? params.get('look') : 'wash')
})
