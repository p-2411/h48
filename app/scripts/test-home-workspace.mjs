import assert from 'node:assert/strict'
import { createJiti } from 'jiti'
const jiti = createJiti(import.meta.url)
const { defaultLayout, cleanLayout, openTile, fitTiles, DEFAULT_SPLIT } = await jiti.import(
  '../src/shared/workspace.ts'
)
const { tileRects, toRect } = await jiti.import('../src/renderer/src/home/layout.ts')
let state = defaultLayout()
for (const id of ['today', 'watching', 'words', 'talk']) state = openTile(state, id, 1120)
assert.deepEqual(state.open, ['today', 'watching', 'words', 'talk'])
assert.deepEqual(fitTiles(state.open, 900), ['today', 'watching', 'talk'])
assert.deepEqual(fitTiles(state.open, 800), ['today', 'talk'])
let narrow = defaultLayout()
for (const id of ['today', 'watching', 'words', 'talk']) narrow = openTile(narrow, id, 900)
assert.deepEqual(narrow.open, ['today', 'watching', 'talk'])
narrow = openTile(narrow, 'words', 900)
assert.deepEqual(narrow.open, ['today', 'words', 'talk'])
assert.deepEqual(openTile(narrow, 'words', 900).open, ['words', 'today', 'talk'])
assert.deepEqual(
  cleanLayout({
    open: ['talk', 'bogus', 'words', 'words', 'today'],
    floating: true,
    split: { duet: 99, pair: NaN, stack: -1 }
  }),
  {
    ...defaultLayout(),
    open: ['words', 'today', 'talk'],
    floating: true,
    split: { ...DEFAULT_SPLIT, duet: 0.78, stack: 0.22 }
  }
)
for (const order of [
  [],
  ['today'],
  ['talk'],
  ['today', 'watching'],
  ['today', 'talk'],
  ['today', 'watching', 'words'],
  ['today', 'watching', 'talk'],
  ['today', 'watching', 'words', 'talk']
])
  for (const stacked of [false, true]) {
    const layout = { ...defaultLayout(), open: order, stacked }
    const result = tileRects(layout)
    const px = (b) => toRect(b, 1104, 664)
    const rects = (order.length ? Object.values(result.rects) : Object.values(result.hub)).map(px)
    assert.equal(rects.length, order.length || 3)
    for (const r of rects) {
      assert.ok(r.width > 0 && r.height > 0)
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1104.01 && r.y + r.height <= 664.01)
    }
    for (let a = 0; a < rects.length; a++)
      for (let b = a + 1; b < rects.length; b++) {
        const x = rects[a],
          y = rects[b]
        assert.ok(
          x.x + x.width <= y.x ||
            y.x + y.width <= x.x ||
            x.y + x.height <= y.y ||
            y.y + y.height <= x.y,
          'tiles do not overlap'
        )
      }
    if (order.includes('talk') && order.length > 1)
      assert.equal(px(result.rects.talk).x, 1104 * 0.64 + 4)
  }
const hub = tileRects(defaultLayout())
assert.equal(toRect(hub.hub.today, 1104, 664).width, 1104 * 0.53 - 4)
assert.equal(hub.dividers.length, 3)
console.log('Home workspace: limits, ordering, sanitization, all layouts, gaps, and bounds passed.')
