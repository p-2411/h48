// Tests the watch log and the streak (src/main/watchlog) on a temporary database, with a small
// fake "electron" module for the app's data folder. Run: node scripts/test-watch-log.mjs (the jiti CLI
// re-runs a file that throws, which hides the first error)
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createJiti } from 'jiti'

const folder = mkdtempSync(join(tmpdir(), 'duet-watch-log-test-'))
const fakeElectron = join(folder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false } }\n`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const root = resolve('src/main')
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

try {
  // --- The study day rolls over at 04:00 ---------------------------------------------------
  const { studyDay, studyDayEnd } = await jiti.import(join(root, 'study-day.ts'))
  assert.equal(
    studyDay(at(2026, 10, 12, 3, 59)),
    '2026-10-11',
    '03:59 still belongs to the day before'
  )
  assert.equal(studyDay(at(2026, 10, 12, 4, 0)), '2026-10-12', '04:00 starts the new day')
  assert.equal(studyDayEnd(at(2026, 10, 12, 23, 0)), at(2026, 10, 13, 4, 0))

  // --- The streak ----------------------------------------------------------------------------
  const { streak, kept, weekOf, addDays } = await jiti.import(join(root, 'watchlog/streak.ts'))
  const day = (date, change = {}) => ({
    day: date,
    watchedMs: 0,
    sessionDone: false,
    checkpoints: 0,
    ...change
  })
  const done = (date) => day(date, { sessionDone: true })
  // 2026-10-12 is a Monday.
  assert.equal(weekOf('2026-10-14'), '2026-10-12')
  assert.equal(weekOf('2026-10-18'), '2026-10-12', 'Sunday is the last day of the week')
  assert.equal(weekOf('2026-10-19'), '2026-10-19')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-03-29', -1), '2026-03-28', 'date steps ignore clock changes')

  assert.equal(
    kept(day('2026-10-12', { watchedMs: 9 * 60_000 })),
    false,
    '9 minutes watched does not keep a day'
  )
  assert.equal(
    kept(day('2026-10-12', { watchedMs: 10 * 60_000 })),
    true,
    '10 minutes watched keeps a day'
  )
  assert.equal(kept(day('2026-10-12', { checkpoints: 1 })), true, 'a checkpoint keeps a day')
  assert.equal(kept(done('2026-10-12')), true, 'the daily session keeps a day')

  assert.deepEqual(
    streak([], '2026-10-14'),
    { days: 0, keptToday: false, freezesLeft: 2 },
    'no days, no streak'
  )
  assert.deepEqual(streak([done('2026-10-14')], '2026-10-14'), {
    days: 1,
    keptToday: true,
    freezesLeft: 2
  })
  assert.deepEqual(
    streak([done('2026-10-13')], '2026-10-14'),
    { days: 1, keptToday: false, freezesLeft: 2 },
    'today not kept yet does not break the streak'
  )
  // Mon, Tue kept; Wed missed (a freeze); Thu kept; today Fri not yet.
  assert.deepEqual(
    streak([done('2026-10-12'), done('2026-10-13'), done('2026-10-15')], '2026-10-16'),
    { days: 3, keptToday: false, freezesLeft: 1 }
  )
  // Mon kept; Tue, Wed, Thu missed: the third miss in one week breaks it.
  assert.equal(streak([done('2026-10-12')], '2026-10-16').days, 0)
  // Freezes are per week: Sat 10-10 kept, Sun 10-11 missed (last week's freeze), Mon and Tue missed
  // (this week's two), Wed kept today.
  assert.deepEqual(streak([done('2026-10-10'), done('2026-10-14')], '2026-10-14'), {
    days: 2,
    keptToday: true,
    freezesLeft: 0
  })
  // A learner coming back after weeks away: old misses bridge nothing, so they use no freezes.
  assert.deepEqual(
    streak([done('2026-09-01'), done('2026-10-14')], '2026-10-14'),
    { days: 1, keptToday: true, freezesLeft: 2 },
    'misses before the streak began use no freezes'
  )
  // Days not kept in the records (watched 2 minutes) count as missed.
  assert.equal(
    streak(
      [done('2026-10-12'), day('2026-10-13', { watchedMs: 120_000 }), done('2026-10-14')],
      '2026-10-14'
    ).days,
    2
  )

  // --- Videos, lines and words ----------------------------------------------------------------
  const { WatchLog, videoKey, VIDEOS_WITH_LINES } = await jiti.import(
    join(root, 'watchlog/index.ts')
  )
  const { database } = await jiti.import(join(root, 'store/db.ts'))
  const log = new WatchLog()
  const video = { site: 'youtube', id: 'abc', url: 'https://www.youtube.com/watch?v=abc' }
  const key = videoKey(video)
  assert.equal(key, 'youtube:abc')
  const count = (sql, ...args) =>
    database()
      .prepare(sql)
      .get(...args).n

  log.noteVideo(video, 'ko', 12, at(2026, 10, 12))
  log.noteVideo({ ...video, title: 'Sintel' }, 'ko', 40, at(2026, 10, 12, 12, 5))
  log.noteVideo(video, 'ko', undefined, at(2026, 10, 12, 12, 6))
  const row = database().prepare('SELECT * FROM videos WHERE id = ?').get(key)
  assert.equal(count('SELECT COUNT(*) n FROM videos'), 1, 'one row per video')
  assert.equal(row.title, 'Sintel', 'a title once known is kept when a later update has none')
  assert.equal(row.position, 40, 'an unknown place keeps the last known one')
  assert.equal(row.last_watched, at(2026, 10, 12, 12, 6))

  const line = (original, start, extra = {}) => ({
    id: 1,
    original,
    at: 0,
    start,
    state: 'ready',
    processed: { translation: 'Hello', source: [], english: [] },
    ...extra
  })
  assert.equal(log.noteLine(key, 'ko', line('안녕하세요', 105.2)), true)
  assert.equal(
    log.noteLine(key, 'ko', line('안녕하세요', 106.4)),
    false,
    'the same line a second off (caption timing) is not added twice'
  )
  assert.equal(
    log.noteLine(key, 'ko', line('안녕하세요', 300)),
    true,
    'the same words later in the video are another line'
  )
  assert.equal(log.noteLine(key, 'ko', line('네', undefined)), true)
  assert.equal(
    log.noteLine(key, 'ko', line('네', undefined)),
    false,
    'a line with no start is not added twice'
  )
  assert.equal(
    log.noteLine(key, 'ko', line('기다려', 10, { state: 'pending', processed: undefined })),
    false,
    'a line not yet translated is not met'
  )
  assert.equal(
    log.noteLine('youtube:never-noted', 'ko', line('왜', 1)),
    false,
    'a line for a video not on record is skipped'
  )
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', key), 3)

  const word = {
    kind: 'hovered',
    videoKey: key,
    language: 'ko',
    text: '친구',
    line: '친구랑 봤어요',
    start: 12
  }
  assert.equal(log.noteWord(word, at(2026, 10, 12, 12, 0)), true)
  assert.equal(
    log.noteWord(word, at(2026, 10, 12, 12, 0) + 30_000),
    false,
    'the same hover within a minute is one event'
  )
  assert.equal(
    log.noteWord(word, at(2026, 10, 12, 12, 2)),
    true,
    'a hover a minute later is a new event'
  )
  assert.equal(
    log.noteWord({ ...word, kind: 'saved' }, at(2026, 10, 12, 12, 2)),
    true,
    'another kind is another event'
  )
  assert.equal(log.noteWord({ ...word, text: '   ' }), false, 'an empty word is skipped')
  assert.equal(
    log.noteWord({ kind: 'saved', language: 'ko', text: '사랑' }),
    true,
    'a card not from a video has no video'
  )

  // Lines are kept for the most recent VIDEOS_WITH_LINES videos; their video rows stay.
  for (let index = 0; index < VIDEOS_WITH_LINES; index++) {
    const other = {
      site: 'youtube',
      id: `v${index}`,
      url: `https://www.youtube.com/watch?v=v${index}`
    }
    log.noteVideo(other, 'ko', 0, at(2026, 10, 13, 12, index))
    log.noteLine(videoKey(other), 'ko', line(`줄 ${index}`, 1))
  }
  assert.equal(
    count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', key),
    0,
    'the oldest video loses its lines'
  )
  assert.equal(
    count('SELECT COUNT(*) n FROM videos WHERE id = ?', key),
    1,
    '...but stays in the list of videos'
  )
  assert.equal(count('SELECT COUNT(DISTINCT video_id) n FROM lines'), VIDEOS_WITH_LINES)

  // --- Days, watch time and the streak ---------------------------------------------------------
  const { FLUSH_EVERY_MS } = await jiti.import(join(root, 'watchlog/index.ts'))
  const days = new WatchLog()
  const dayRow = (date) => database().prepare('SELECT * FROM days WHERE day = ?').get(date)
  const start = at(2026, 10, 20, 20, 0)
  days.addWatchTime(4 * 60_000, key, start)
  assert.equal(dayRow('2026-10-20'), undefined, 'watch time is buffered, not written every tick')
  days.addWatchTime(6 * 60_000, key, start + FLUSH_EVERY_MS)
  assert.equal(dayRow('2026-10-20').watched_ms, 10 * 60_000, 'buffered time is written every 15 s')
  assert.equal(
    database().prepare('SELECT watched_ms n FROM videos WHERE id = ?').get(key).n,
    10 * 60_000,
    '...to the video too'
  )
  assert.deepEqual(
    days.streak(start + FLUSH_EVERY_MS),
    { days: 1, keptToday: true, freezesLeft: 2 },
    '10 minutes keeps the day'
  )

  days.addWatchTime(60_000, key, at(2026, 10, 21, 3, 30))
  days.flush(at(2026, 10, 21, 3, 30))
  assert.equal(
    dayRow('2026-10-20').watched_ms,
    11 * 60_000,
    'watching at 03:30 counts for the day before'
  )
  assert.equal(dayRow('2026-10-21'), undefined)

  days.addWatchTime(30_000, key, at(2026, 10, 21, 20, 0))
  days.flush(at(2026, 10, 21, 20, 0))
  assert.equal(
    dayRow('2026-10-21').watched_ms,
    30_000,
    'flush writes what is buffered (quitting mid-video)'
  )

  days.markCheckpointDone(at(2026, 10, 22, 9, 0))
  days.markSessionDone(at(2026, 10, 23, 9, 0))
  assert.equal(dayRow('2026-10-22').checkpoints_done, 1)
  assert.equal(dayRow('2026-10-23').session_done, 1)
  // 20th kept (watched), 21st missed (a freeze), 22nd checkpoint, 23rd session.
  assert.deepEqual(days.streak(at(2026, 10, 23, 10, 0)), {
    days: 3,
    keptToday: true,
    freezesLeft: 1
  })

  // --- Feeding the log -------------------------------------------------------------------------
  const { EventEmitter } = await import('node:events')
  const { connectWatchLog, MAX_TICK_MS } = await jiti.import(join(root, 'watchlog/connect.ts'))
  const fed = new WatchLog()
  const watcher = Object.assign(new EventEmitter(), {
    currentVideo: {
      site: 'youtube',
      id: 'fed',
      url: 'https://www.youtube.com/watch?v=fed',
      title: 'Fed'
    },
    currentLine: undefined,
    moment: () => undefined
  })
  const player = { playing: true, now: () => 50 }
  const cards = new EventEmitter()
  let duetShown = true
  const link = connectWatchLog(fed, {
    watcher,
    player,
    settings: { current: { language: 'ko' } },
    cards,
    shown: () => duetShown
  })
  const t0 = at(2026, 11, 2, 20, 0)
  link.tick(t0)
  link.tick(t0 + 100)
  link.tick(t0 + 100 + 5 * 60_000) // the laptop slept: counts as MAX_TICK_MS, not 5 minutes
  player.playing = false
  link.tick(t0 + 100 + 5 * 60_000 + 100) // paused: does not count
  fed.flush(t0 + 100 + 5 * 60_000 + 100)
  assert.equal(
    database().prepare('SELECT watched_ms n FROM days WHERE day = ?').get('2026-11-02').n,
    100 + MAX_TICK_MS
  )
  assert.equal(
    database().prepare('SELECT title FROM videos WHERE id = ?').get('youtube:fed').title,
    'Fed',
    'the video on screen is on record'
  )

  // A translated line that comes on screen is met.
  const shown = line('저는 어제 영화를 봤어요', 61)
  watcher.currentLine = shown
  watcher.emit('current', shown.id)
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', 'youtube:fed'), 1)
  // A line still translating when it comes on screen is met once it is translated.
  const late = line('늦었어요', 70, { id: 2, state: 'pending', processed: undefined })
  watcher.currentLine = late
  watcher.emit('current', late.id)
  const ready = {
    ...late,
    state: 'ready',
    processed: { translation: "I'm late", source: [], english: [] }
  }
  watcher.currentLine = ready
  watcher.emit('line', ready)
  assert.equal(count('SELECT COUNT(*) n FROM lines WHERE video_id = ?', 'youtube:fed'), 2)

  // Saving a card from a video logs the word with its video; a card not from a video, without.
  const moment = {
    language: 'ko',
    line: shown,
    earlier: [],
    video: { site: 'youtube', id: 'fed', position: 61 },
    takenAt: 0
  }
  cards.emit('saved', { language: 'ko', expression: '영화', source: { kind: 'video', moment } })
  cards.emit('saved', { language: 'ko', expression: '사랑해', source: { kind: 'tutor' } })
  assert.equal(
    count(
      "SELECT COUNT(*) n FROM word_events WHERE kind = 'saved' AND video_id = 'youtube:fed' AND text = '영화'"
    ),
    1
  )
  assert.equal(
    count(
      "SELECT COUNT(*) n FROM word_events WHERE kind = 'saved' AND video_id IS NULL AND text = '사랑해'"
    ),
    1
  )
  // Explaining a line logs it.
  link.explained(moment)
  assert.equal(
    count(
      "SELECT COUNT(*) n FROM word_events WHERE kind = 'explained' AND text = '저는 어제 영화를 봤어요'"
    ),
    1
  )

  // With Duet hidden, watching is not watching with Duet: no time, no lines met.
  duetShown = false
  player.playing = true // so only Duet being hidden can stop the time counting
  const t1 = at(2026, 11, 3, 20, 0)
  link.tick(t1)
  link.tick(t1 + 500)
  fed.flush(t1 + 500)
  assert.equal(
    database().prepare('SELECT watched_ms n FROM days WHERE day = ?').get('2026-11-03'),
    undefined,
    'no time while Duet is hidden'
  )
  const hiddenLine = line('안 보여요', 90, { id: 3 })
  watcher.currentLine = hiddenLine
  watcher.emit('current', hiddenLine.id)
  assert.equal(
    count('SELECT COUNT(*) n FROM lines WHERE original = ?', '안 보여요'),
    0,
    'a line under a hidden Duet is not met'
  )
  duetShown = true

  // A watch-log failure (disk full, a locked database) never breaks watching, saving or the loop:
  // it is reported, and the feature that fired the event carries on.
  const broken = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('disk I/O error')
      }
    }
  )
  const brokenWatcher = Object.assign(new EventEmitter(), {
    currentVideo: watcher.currentVideo,
    currentLine: hiddenLine,
    moment: () => ({ ...moment, line: hiddenLine })
  })
  const brokenCards = new EventEmitter()
  const reported = []
  const consoleError = console.error
  console.error = (...args) => reported.push(args.join(' '))
  try {
    const brokenLink = connectWatchLog(broken, {
      watcher: brokenWatcher,
      player,
      settings: { current: { language: 'ko' } },
      cards: brokenCards,
      shown: () => true
    })
    assert.doesNotThrow(
      () => brokenWatcher.emit('current', hiddenLine.id),
      'a line on screen still reaches the strip'
    )
    assert.doesNotThrow(
      () => brokenWatcher.emit('line', hiddenLine),
      'a translated line is still shown'
    )
    assert.doesNotThrow(
      () =>
        brokenCards.emit('saved', {
          language: 'ko',
          expression: '영화',
          source: { kind: 'tutor' }
        }),
      'a saved card still reports saved'
    )
    assert.doesNotThrow(() => brokenLink.tick(t1 + 1000), 'the main loop carries on')
    assert.doesNotThrow(() => brokenLink.explained(moment), 'Explain still opens')
  } finally {
    console.error = consoleError
  }
  assert.ok(reported.length >= 5, 'each failure is reported, not swallowed')
  assert.ok(reported.every((text) => text.includes('[duet] watch log')))

  // --- Word hovers -------------------------------------------------------------------------------
  // 친구 and 랑 share pair 1, so the strip's popup (and the hover) names them together: "친구랑".
  const tokens = [
    { text: '저는', job: 'p', pair: 0, space: true },
    { text: '친구', job: 'n', pair: 1, space: false },
    { text: '랑', job: 'g', pair: 1, space: true },
    { text: '봤어요', job: 'v', pair: 2, space: false }
  ]
  const hoveredLine = {
    ...line('저는 친구랑 봤어요', 80, { id: 7 }),
    processed: { translation: 'I saw it with a friend', source: tokens, english: [] }
  }
  watcher.moment = (lineId) =>
    lineId === 7
      ? {
          language: 'ko',
          line: hoveredLine,
          earlier: [],
          video: { site: 'youtube', id: 'fed', position: 80 },
          takenAt: 0
        }
      : undefined
  link.hovered(7, '친구랑')
  link.hovered(7, '친구') // part of a pair, not what the strip names
  link.hovered(7, 'rm -rf /') // not a word of that line
  link.hovered(99, '친구랑') // no such line
  link.hovered('7', '친구랑') // not a line id
  assert.equal(
    count("SELECT COUNT(*) n FROM word_events WHERE kind = 'hovered' AND video_id = 'youtube:fed'"),
    1,
    'only a word of that line is logged'
  )
  assert.equal(
    database()
      .prepare("SELECT start FROM word_events WHERE kind = 'hovered' AND video_id = 'youtube:fed'")
      .get().start,
    80
  )

  // --- Quitting -------------------------------------------------------------------------------------
  // Quitting writes where the video is now, not where it was at the last 15-second update, along with
  // watch time not yet written.
  player.playing = true
  player.now = () => 95
  const quitAt = at(2026, 11, 4, 20, 0)
  link.tick(quitAt)
  link.tick(quitAt + 400)
  player.now = () => 107
  link.finish(quitAt + 400)
  assert.equal(
    database().prepare('SELECT position n FROM videos WHERE id = ?').get('youtube:fed').n,
    107,
    'where you left off is where you quit'
  )
  assert.equal(
    database().prepare('SELECT watched_ms n FROM days WHERE day = ?').get('2026-11-04').n,
    MAX_TICK_MS + 400,
    'the last seconds watched are kept (the gap since the block before counts as one tick)'
  )

  // --- A video is on record only once it is watched ---------------------------------------------
  // Opening a video page is not watching it: no row until it plays with Duet shown. A paused video
  // keeps its title and place up to date but doesn't move up the list of videos watched.
  const opened = new WatchLog()
  const page = {
    site: 'youtube',
    id: 'opened',
    url: 'https://www.youtube.com/watch?v=opened',
    title: 'Opened'
  }
  opened.noteVideo(page, 'ko', 3, at(2026, 11, 5, 20, 0), { watching: false })
  assert.equal(
    count("SELECT COUNT(*) n FROM videos WHERE id = 'youtube:opened'"),
    0,
    'a video only opened is not on record'
  )
  opened.noteVideo(page, 'ko', 10, at(2026, 11, 5, 20, 1))
  opened.noteVideo({ ...page, title: 'Opened, renamed' }, 'ko', 42, at(2026, 11, 6, 9, 0), {
    watching: false
  })
  const paused = database().prepare("SELECT * FROM videos WHERE id = 'youtube:opened'").get()
  assert.equal(paused.position, 42, 'a paused video keeps where it is')
  assert.equal(paused.title, 'Opened, renamed')
  assert.equal(
    paused.last_watched,
    at(2026, 11, 5, 20, 1),
    'pausing overnight does not count as watching'
  )
  // ...and in the app: a page left paused never gets a row, however long Duet ticks over it.
  const idleWatcher = Object.assign(new EventEmitter(), {
    currentVideo: { site: 'youtube', id: 'idle', url: 'https://www.youtube.com/watch?v=idle' },
    currentLine: undefined,
    moment: () => undefined
  })
  const idlePlayer = { playing: false, now: () => 0 }
  const idleLink = connectWatchLog(opened, {
    watcher: idleWatcher,
    player: idlePlayer,
    settings: { current: { language: 'ko' } },
    cards: new EventEmitter(),
    shown: () => true
  })
  idleLink.tick(at(2026, 11, 6, 10, 0))
  idleLink.tick(at(2026, 11, 6, 10, 0) + 20_000)
  idleLink.finish(at(2026, 11, 6, 10, 1))
  assert.equal(
    count("SELECT COUNT(*) n FROM videos WHERE id = 'youtube:idle'"),
    0,
    'a paused page is not a video watched'
  )
  idlePlayer.playing = true
  idleLink.tick(at(2026, 11, 6, 10, 1) + 1000)
  assert.equal(
    count("SELECT COUNT(*) n FROM videos WHERE id = 'youtube:idle'"),
    1,
    'the moment it plays, it is (not at the next 15-second update)'
  )

  console.log('Watch log tests passed.')
} finally {
  rmSync(folder, { recursive: true, force: true })
}
