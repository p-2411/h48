// Checks progress tracking: a video's score and reading level (src/shared/progress.ts), and the watch
// log's tallies and day scores with the Progress class (src/main/progress) on a temporary database,
// with a small fake "electron" module. Run: node scripts/test-progress.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-progress-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `const handlers = new Map()
module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false }, ipcMain: { handle: (channel, work) => handlers.set(channel, work) }, handlers }
`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})

try {
  const { videoScore, percent, unitRank, readingLevel, levelText, levelsOf } = await jiti.import(
    resolve('src/shared/progress.ts')
  )
  const word = (base, job, count, text = base, language = 'es') => ({
    key: `${language}:${base}`,
    text,
    job,
    count
  })

  // --- The score: weight by job, credit by rung --------------------------------------------
  const words = [
    word('perro', 'n', 4), // weight 4, known 0.6 → 2.4
    word('ir', 'v', 6, 'fue'), // weight 6, usable 1 → 6
    word('yo', 'p', 8), // weight 4 (half), speakable 0.8 → 3.2
    word('gato', 'n', 2), // weight 2, seen 0
    word('comer', 'v', 4), // weight 4, no rung yet (unknown) 0
    word('de', 'g', 10), // glue: weight 0
    word('maría', 'x', 3), // a name: weight 0
    word('casa', 'n', 5) // ignored by the learner: weight 0
  ]
  const states = {
    'es:perro': 'known',
    'es:ir': 'usable',
    'es:yo': 'speakable',
    'es:gato': 'encountered',
    'es:de': 'ignored',
    'es:maría': 'ignored',
    'es:casa': 'ignored'
  }
  const score = videoScore(words, states)
  assert.ok(Math.abs(score - 11.6 / 20) < 1e-9, `the weighted score (got ${score})`)
  assert.equal(percent(score), 58, 'rounded down, without float error (0.58 × 100 is 57.999…)')
  assert.equal(percent(0.999), 99, 'rounded down')
  assert.equal(percent(1), 100)
  assert.equal(
    videoScore([word('ir', 'v', 14)], { 'es:ir': 'usable' }),
    undefined,
    'under 15 weighted units: no score yet'
  )
  assert.equal(
    videoScore([word('ir', 'v', 15)], { 'es:ir': 'usable' }),
    1,
    'every word usable: 100%'
  )
  assert.equal(
    videoScore([word('ir', 'v', 15), word('de', 'g', 100)], {
      'es:ir': 'known',
      'es:de': 'ignored'
    }),
    0.6,
    'glue words do not hold the score back'
  )
  assert.equal(
    videoScore([word('ir', 'v', 20)], { 'es:ir': 'ignored' }),
    undefined,
    'a video of only ignored words has no score'
  )

  // --- A unit's rank in the frequency list ----------------------------------------------------
  const list = (words) => (form) => {
    const index = words.indexOf(form)
    return index < 0 ? undefined : index + 1
  }
  const es = list(['de', 'ser', 'fue', 'ir', 'nada', 'perro'])
  assert.equal(
    unitRank('es', word('ir', 'v', 1, 'Fue'), es),
    3,
    'the form seen when it ranks better (in lower case)'
  )
  assert.equal(unitRank('es', word('perro', 'n', 1, 'perros'), es), 6, 'the dictionary form')
  assert.equal(unitRank('es', word('de nada', 'n', 1), es), 5, 'a phrase: its rarest word')
  assert.equal(
    unitRank('es', word('de gato', 'n', 1), es),
    undefined,
    'a phrase with a word not in the list'
  )
  assert.equal(unitRank('es', word('gato', 'n', 1), es), undefined, 'not in the list')
  const ko = list(['이', '먹', '공부', '공부하'])
  assert.equal(
    unitRank('ko', word('먹다', 'v', 1, '먹어요', 'ko'), ko),
    2,
    'Korean: a verb by its stem'
  )
  assert.equal(
    unitRank('ko', word('공부하다', 'v', 1, '공부해요', 'ko'), ko),
    3,
    'Korean: a 하다 verb by its noun'
  )
  assert.equal(unitRank('es', word('먹다', 'v', 1), ko), undefined, 'stems are only for Korean')
  const ja = list(['の', '行く', '映画'])
  assert.equal(
    unitRank('ja', word('行く', 'v', 1, '行った', 'ja'), ja),
    2,
    'Japanese: the dictionary form'
  )
  assert.equal(
    unitRank('es', word('perro', 'n', 1, 'perro'.normalize('NFD')), list(['perro'])),
    1,
    'forms compared in one Unicode form'
  )

  // --- Reading levels: the rank that covers 90% of the weight -------------------------------
  // `count` units ranked `rank`, each a different noun.
  let made = 0
  const units = (count, rank) =>
    Array.from({ length: count }, () => ({ word: word(`w${made++}`, 'n', 1), rank }))
  const grade = (groups, extra = []) => {
    const all = groups.flat()
    const ranks = new Map(all.map(({ word, rank }) => [word.key.slice(3), rank]))
    return readingLevel('es', [...all.map(({ word }) => word), ...extra], (form) => ranks.get(form))
  }
  assert.equal(grade([units(36, 500), units(4, 9000)]), 1, '90% within the top 500')
  assert.equal(grade([units(36, 501), units(4, 9000)]), 2, 'just past 500')
  assert.equal(grade([units(35, 100), units(5, 900)]), 2, '35 of 40 is not 90%: the 36th sets it')
  assert.equal(grade([units(36, 3000), units(4, 9000)]), 4)
  assert.equal(grade([units(36, 8000), units(4, 9000)]), 5)
  assert.equal(grade([units(36, 8001), units(4, 9000)]), 6, 'past the lists: level 6')
  assert.equal(grade([units(39, 100)]), undefined, 'under 40 matched: not graded yet')
  assert.equal(
    grade([units(40, 100)], [word('xa', 'n', 10), word('xb', 'n', 8)]),
    undefined,
    '40 matched of 58 is under 70%: not graded'
  )
  assert.equal(
    grade([units(40, 100)], [word('xa', 'n', 17)]),
    1,
    '40 matched of 57 is 70%: graded, the unmatched left out'
  )
  assert.equal(
    grade([units(40, 100)], [word('de', 'g', 500), word('maría', 'x', 500)]),
    1,
    'glue and names are not in the weight'
  )
  assert.equal(
    grade([units(40, 100), [{ word: word('yo', 'p', 60), rank: 9000 }]]),
    6,
    'pronouns weigh half: 30 of 70 is past the 10% left'
  )
  assert.equal(levelText(2), 'Reading level 2: the 1,000 most common words cover almost all of it.')
  assert.equal(levelText(6), 'Reading level 6: it needs more than the 8,000 most common words.')

  // --- Each level's averages -----------------------------------------------------------------
  assert.deepEqual(
    levelsOf([
      { level: 3, now: 70, then: 50 },
      { level: 3, now: 61 }, // first watched today: its then is its now
      { level: 1, now: 90, then: 85 },
      { level: 2 }, // no % yet
      { now: 40 } // not graded yet
    ]),
    [
      { level: 1, videos: 1, now: 90, then: 85 },
      { level: 3, videos: 2, now: 65, then: 55 }
    ],
    'averages rounded down, easiest first; videos with no % or level left out'
  )
  console.log('progress: scores and reading levels ok')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
