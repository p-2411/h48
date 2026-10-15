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
  assert.equal(
    unitRank('ko', word('바다', 'n', 1, '바다', 'ko'), list(['바', '바다'])),
    2,
    'a Korean noun keeps its 다 (바다 is not 바)'
  )
  assert.equal(
    unitRank('ko', word('예쁘다', 'a', 1, '예뻐요', 'ko'), list(['예쁘'])),
    1,
    'a describing word by its stem'
  )
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

  // --- The watch log: each video's words, and its % by study day ---------------------------
  const { WatchLog } = await jiti.import(resolve('src/main/watchlog/index.ts'))
  const { database } = await jiti.import(resolve('src/main/store/db.ts'))
  const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()
  const log = new WatchLog()
  const key = 'youtube:abc'
  log.noteVideo(
    { site: 'youtube', id: 'abc', url: 'https://www.youtube.com/watch?v=abc', title: 'Coco' },
    'es',
    0,
    at(2026, 10, 14)
  )
  const token = (text, job, pair, base) => ({ text, job, pair, space: true, base })
  const met = (original, start, source) => ({
    id: 1,
    original,
    at: 0,
    start,
    state: 'ready',
    processed: { translation: 'x', source, english: [] }
  })
  // "Fue al perro, fue.": ir twice (two pairs), a glue word, punctuation with no pair.
  const first = [
    token('Fue', 'v', 1, 'ir'),
    token('al', 'g', 2, 'a'),
    token('perro', 'n', 3),
    token(',', 'g', null),
    token('fue', 'v', 4, 'ir')
  ]
  assert.equal(log.noteLine(key, 'es', met('Fue al perro, fue.', 1, first)), true)
  assert.equal(
    log.noteLine(key, 'es', met('Fue al perro, fue.', 1.5, first)),
    false,
    'the same line again'
  )
  log.noteLine(key, 'es', met('Perros.', 9, [token('Perros', 'n', 1, 'perro')]))
  const byKey = (words) => Object.fromEntries(words.map((word) => [word.key, word]))
  const tally = byKey(log.videoWords(key, 'es'))
  assert.deepEqual(Object.keys(tally).sort(), ['es:a', 'es:ir', 'es:perro'])
  assert.equal(tally['es:ir'].count, 2, 'the same word twice in a line counts twice')
  assert.equal(tally['es:perro'].count, 2, 'and in another line once more; the same line again not')
  assert.equal(tally['es:perro'].text, 'Perros', 'the form last seen')
  assert.equal(tally['es:a'].job, 'g')
  // Another language on the same video keeps its own words.
  log.noteLine(key, 'ja', met('行く', 20, [token('行く', 'v', 1)]))
  assert.equal(log.videoWords(key, 'es').length, 3)
  assert.deepEqual(
    log.videoWords(key, 'ja').map((word) => word.key),
    ['ja:行く']
  )
  assert.deepEqual([...log.allVideoWords('ja').keys()], [key])
  assert.equal(log.allVideoWords('ko').size, 0)
  // A word met in two jobs is counted in each, so the job seen last doesn't reweigh the rest.
  const changes = log.talliesChanged
  log.noteLine(key, 'es', met('Que que.', 40, [token('Que', 'g', 1, 'que'), token('que', 'p', 2)]))
  log.noteLine(key, 'es', met('Que.', 45, [token('Que', 'g', 1, 'que')]))
  assert.deepEqual(
    log
      .videoWords(key, 'es')
      .filter((word) => word.key === 'es:que')
      .map((word) => [word.job, word.count]),
    [
      ['g', 2],
      ['p', 1]
    ]
  )
  assert.equal(log.talliesChanged, changes + 2, 'each tally is told')

  // The lines kept are tallied again once, from scratch (a run that failed left words met since,
  // which must not count twice); a damaged line is skipped.
  const before = log.videoWords(key, 'es')
  database()
    .prepare(
      'INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(key, 'es', 30, 'roto', 'broken', '{not json', at(2026, 10, 14))
  database()
    .prepare(
      'INSERT INTO lines (video_id, language, start, original, translation, processed, met_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      key,
      'es',
      31,
      'raro',
      'odd',
      JSON.stringify({ source: [{ pair: 1, base: 5 }] }),
      at(2026, 10, 14)
    )
  assert.equal(log.tallyKeptLines(), 5, 'five good lines; the damaged ones skipped')
  assert.deepEqual(log.videoWords(key, 'es'), before, 'the same tally as when the lines were met')
  assert.equal(log.tallyKeptLines(), 0, 'only once')

  // A video's % by study day: replaced within a day, the earliest day is its "then".
  log.noteScore(key, 'es', 0.4, at(2026, 10, 14, 12))
  log.noteScore(key, 'es', 0.45, at(2026, 10, 14, 20))
  log.noteScore(key, 'es', 0.5, at(2026, 10, 15, 3)) // 03:00: still the 14th's study day
  log.noteScore(key, 'es', 0.6, at(2026, 10, 16))
  log.noteScore(key, 'ja', 0.1, at(2026, 10, 13))
  const rows = database()
    .prepare("SELECT day, score FROM video_scores WHERE language = 'es' ORDER BY day")
    .all()
    .map((row) => ({ ...row }))
  assert.deepEqual(rows, [
    { day: '2026-10-14', score: 0.5 },
    { day: '2026-10-16', score: 0.6 }
  ])
  assert.deepEqual(log.firstScores('es').get(key), { day: '2026-10-14', score: 0.5 })
  assert.deepEqual(
    log.firstScores('ja').get(key),
    { day: '2026-10-13', score: 0.1 },
    'per language'
  )
  console.log('progress: tallies and day scores ok')

  // --- Progress: then and now, and the reading level ---------------------------------------
  const { Progress } = await jiti.import(resolve('src/main/progress/index.ts'))
  const { connectProgress } = await jiti.import(resolve('src/main/progress/ipc.ts'))
  const { connectWatchLog } = await jiti.import(resolve('src/main/watchlog/connect.ts'))
  const { EventEmitter } = await import('node:events')
  const { handlers } = await jiti.import(fakeElectron)
  // The ladder, faked: every word on the rung `rungOf` gives it.
  let rungOf = () => 'known'
  const knowledge = {
    statesFor: (language, keys) =>
      Object.fromEntries(
        keys.filter((k) => k.startsWith(`${language}:`)).map((k) => [k, rungOf(k)])
      )
  }
  // Every word ranks 100, so 40 or more of them make reading level 1.
  const progress = new Progress({ log, knowledge, rankOf: () => () => 100 })
  const p1 = 'youtube:p1'
  log.noteVideo(
    { site: 'youtube', id: 'p1', url: 'https://www.youtube.com/watch?v=p1' },
    'es',
    0,
    at(2026, 10, 20)
  )
  const nouns = (from, to) =>
    Array.from({ length: to - from }, (_, index) => token(`n${from + index}`, 'n', index + 1))
  log.noteLine(p1, 'es', met('uno', 1, nouns(0, 20)))
  progress.snapshot(p1, 'es', at(2026, 10, 20, 12))
  assert.deepEqual(
    progress.summary('es', at(2026, 10, 20, 13)).videos[p1],
    { now: 60 },
    'first day: a %, no then yet, too few words for a level'
  )
  log.noteLine(p1, 'es', met('dos', 10, nouns(20, 40)))
  progress.snapshot(p1, 'es', at(2026, 10, 20, 14))
  // The next day half the words can be used.
  rungOf = (key) => (Number(key.slice(4)) % 2 ? 'usable' : 'known')
  const next = progress.summary('es', at(2026, 10, 21))
  assert.deepEqual(next.videos[p1], { level: 1, now: 80, then: 60 }, 'then kept, now from today')
  assert.deepEqual(next.levels, [{ level: 1, videos: 1, now: 80, then: 60 }])
  assert.deepEqual(next.videos[key], { then: 50 }, 'too few words for a % now: only its then')
  assert.deepEqual(progress.summary('ko', at(2026, 10, 21)), { videos: {}, levels: [] })

  // Only the home base asks, for a language Duet teaches.
  connectProgress(progress, { owns: (sender) => sender === 'home' })
  const ask = handlers.get('progress:summary')
  assert.deepEqual(ask({ sender: 'home' }, 'es'), progress.summary('es'))
  assert.throws(() => ask({ sender: 'strip' }, 'es'), /Not allowed/)
  assert.throws(() => ask({ sender: 'home' }, 'fr'), /language/)

  // While a video plays with Duet on, its % is noted about once a minute, and when Duet quits.
  const snapshots = []
  const watcher = Object.assign(new EventEmitter(), {
    currentVideo: { site: 'youtube', id: 'p1', url: 'https://www.youtube.com/watch?v=p1' },
    currentLine: undefined,
    moment: () => undefined
  })
  const player = { playing: true, now: () => 5 }
  const link = connectWatchLog(log, {
    watcher,
    player,
    settings: { current: { language: 'es' } },
    cards: new EventEmitter(),
    progress: { snapshot: (video, language, now) => snapshots.push([video, language, now]) },
    shown: () => true
  })
  const t = at(2026, 10, 22)
  link.tick(t)
  link.tick(t + 30_000)
  link.tick(t + 61_000)
  player.playing = false
  link.tick(t + 90_000)
  link.tick(t + 130_000)
  assert.deepEqual(
    snapshots.map(([, , now]) => now - t),
    [0, 61_000, 90_000],
    'once a minute while playing, once when it pauses, and not again while paused'
  )
  // Another video: the one left is noted, then the new one.
  player.playing = true
  watcher.currentVideo = { site: 'youtube', id: 'p2', url: 'https://www.youtube.com/watch?v=p2' }
  snapshots.length = 0
  link.tick(t + 135_000)
  assert.deepEqual(
    snapshots.map(([video]) => video),
    [p1, 'youtube:p2'],
    'the video left, then the new one'
  )
  link.finish(t + 140_000)
  assert.deepEqual(snapshots.at(-1), ['youtube:p2', 'es', t + 140_000], 'and when Duet quits')

  // A summary asked again with no new words reads videos' words once.
  let reads = 0
  const counted = Object.create(log, {
    allVideoWords: { value: (language) => (reads++, log.allVideoWords(language)) }
  })
  const cached = new Progress({ log: counted, knowledge, rankOf: () => () => 100 })
  cached.summary('es', at(2026, 10, 21))
  const again = cached.summary('es', at(2026, 10, 21))
  assert.equal(reads, 1, 'kept while nothing changed')
  assert.deepEqual(again, progress.summary('es', at(2026, 10, 21)))
  log.noteLine(p1, 'es', met('tres', 30, nouns(40, 41)))
  cached.summary('es', at(2026, 10, 21))
  assert.equal(reads, 2, 'read again once a line is tallied')
  cached.summary('ja', at(2026, 10, 21))
  assert.equal(reads, 3, 'and for another language')
  // A failing snapshot goes no further than a report.
  const failing = connectWatchLog(log, {
    watcher,
    player: { playing: true, now: () => 5 },
    settings: { current: { language: 'es' } },
    cards: new EventEmitter(),
    progress: {
      snapshot: () => {
        throw new Error('locked')
      }
    },
    shown: () => true
  })
  const quiet = console.error
  console.error = () => undefined
  try {
    assert.doesNotThrow(() => failing.tick(t + 200_000))
  } finally {
    console.error = quiet
  }
  console.log('progress: then and now ok')

  // --- As the home base says it --------------------------------------------------------------
  const { understood, videoLine, levelLine, metAndKnownLine } = await jiti.import(
    resolve('src/renderer/src/home/progress.ts')
  )
  assert.equal(
    videoLine({ level: 3, now: 72, then: 58 }),
    'Reading level 3 · 72% understood · up from 58%'
  )
  assert.equal(
    videoLine({ level: 3, now: 58, then: 58 }),
    'Reading level 3 · 58% understood',
    'no "up" when the same'
  )
  assert.equal(videoLine({ now: 50, then: 60 }), '50% understood', 'nor when it went down')
  assert.equal(videoLine({ level: 2 }), 'Reading level 2')
  assert.equal(videoLine({ then: 40 }), undefined, 'nothing known now: nothing said')
  assert.equal(videoLine(undefined), undefined)
  assert.equal(understood({ now: 72, then: 58 }), '72% understood · up from 58%')
  assert.equal(
    levelLine({ level: 3, videos: 2, now: 65, then: 55 }),
    '65% understood · 2 videos · up from 55%'
  )
  assert.equal(levelLine({ level: 1, videos: 1, now: 90, then: 90 }), '90% understood · 1 video')
  assert.equal(
    metAndKnownLine({
      unknown: 0,
      encountered: 1163,
      known: 35,
      speakable: 10,
      usable: 4,
      ignored: 80
    }),
    '1,212 met · 49 you know',
    'met leaves out ignored words; known counts known and up'
  )
  console.log('progress: home base text ok')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
