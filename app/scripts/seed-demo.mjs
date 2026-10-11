// Builds a demo profile for Duet in Japanese, from scratch, for a live demo: settings, three videos
// in Continue watching (one with its 48 real lines), ten cards with two weeks of reviews, the
// knowledge ladder and a 12-day streak that ends yesterday. It writes through the app's own modules
// (src/main/...) with a small fake "electron" module whose data folder is the demo folder, so the
// schema is the app's. The real data folder is only read (the lines of one video), never written.
//
// Run: npm run demo:seed [-- <folder>]  (default: ~/Library/Application Support/Duet Demo)
// Then: npm run demo  (Duet on the demo profile)
// Running it again resets the profile to the same state (as of the day it is run).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createJiti } from 'jiti'

const SUPPORT = join(homedir(), 'Library', 'Application Support')
const REAL_FOLDER = join(SUPPORT, 'app')
const folder = resolve(process.argv[2] ?? join(SUPPORT, 'Duet Demo'))
if (folder === resolve(REAL_FOLDER)) throw new Error('Refusing to seed the real data folder.')

const MAIN_ID = 'MmvaYPjogwQ'
const MAIN_KEY = `youtube:${MAIN_ID}`
const MAIN_TITLE = '1 Hour Real Japanese Conversation | About Life, Friends, and Travel #72'
const MAIN_POSITION = 229.3
// Two more real videos (thumbnails checked on i.ytimg.com), watched on the two days before.
const MORE_VIDEOS = [
  {
    id: 'oK1TpAgstLk',
    title: 'Easy Japanese in Yokohama | Chinatown & Red Brick (N5–N4)',
    position: 318,
    daysAgo: 1
  },
  {
    id: 'gRZdjrxjWvE',
    title: '30min Japanese Conversation | Language, Work and Life #114',
    position: 842,
    daysAgo: 2
  }
]
const MODEL = 'openai/gpt-6-luna'

// --- The main video's lines, read from the real database (read-only) ----------------------------
// A copy is kept in the demo folder, so the seed still works if the real database loses the video.
const SNAPSHOT = join(folder, 'seed-source.json')

function readSource() {
  const realDb = join(REAL_FOLDER, 'duet.db')
  if (existsSync(realDb)) {
    const db = new DatabaseSync(realDb, { readOnly: true })
    try {
      const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(MAIN_KEY)
      const lines = db
        .prepare(
          'SELECT start, original, translation, processed FROM lines WHERE video_id = ? ORDER BY start'
        )
        .all(MAIN_KEY)
      if (video && lines.length) return { video, lines: lines.map((line) => ({ ...line })) }
    } finally {
      db.close()
    }
  }
  if (existsSync(SNAPSHOT)) return JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  throw new Error(`No lines for ${MAIN_KEY} in ${realDb}, and no ${SNAPSHOT}.`)
}

// Lines processed before the line model gave dictionary forms have none: these are theirs, so the
// ladder keys them as the app does today ("変わる" for 変わらなかった). Only `base` is added.
const BASES = {
  何回も何回も: '何回も',
  言われたことがあります: '言われる',
  幸せには: '幸せ',
  幸せにはしてくれない: '幸せにする',
  言おうと思ってました: '言う',
  いいですね: 'いい',
  でした: 'です',
  どんな子供: '子供',
  元気な子供: '元気',
  同じだった: '同じ',
  と思います: '思う',
  子供の時: '子供',
  子供の時から: '子供',
  大人になっていない: '大人になる',
  わからない: 'わかる',
  んですけど: 'けど',
  生まれた: '生まれる',
  生まれた時から: '生まれる',
  変わらない: '変わる',
  変われない: '変わる',
  んですかね: 'ね',
  の中: '中',
  生きていなかった: '生きる',
  だった: 'だ',
  かもしれません: 'かもしれない',
  と同じ: '同じ',
  をしていない: 'する',
  にならない: 'なる',
  生きてきた: '生きる',
  変わらなかった: '変わる'
}

function withBases(processed) {
  return {
    ...processed,
    source: processed.source.map((token) =>
      token.base || token.pair === null
        ? token
        : { ...token, base: BASES[token.text] ?? token.text }
    )
  }
}

const source = readSource()
mkdirSync(folder, { recursive: true })
writeFileSync(SNAPSHOT, JSON.stringify(source))
// A fresh profile: only Duet's database goes (the app keeps everything there).
for (const file of ['duet.db', 'duet.db-wal', 'duet.db-shm'])
  rmSync(join(folder, file), { force: true })

const fakeFolder = mkdtempSync(join(tmpdir(), 'duet-demo-seed-'))
const fakeElectron = join(fakeFolder, 'fake-electron.cjs')
writeFileSync(
  fakeElectron,
  `module.exports = { app: { getPath: () => ${JSON.stringify(folder)} }, is: { dev: false }, ipcMain: { handle() {}, on() {} } }\n`
)
const jiti = createJiti(import.meta.url, {
  alias: { electron: fakeElectron, '@electron-toolkit/utils': fakeElectron },
  moduleCache: true
})
const root = resolve('src/main')
const load = (path) => jiti.import(join(root, path))

try {
  const { database } = await load('store/db.ts')
  const { Settings } = await load('settings.ts')
  const { WatchLog } = await load('watchlog/index.ts')
  const { addDays, weekOf } = await load('watchlog/streak.ts')
  const { studyDay, studyDayEnd } = await load('study-day.ts')
  const { CardStore } = await load('cards/store.ts')
  const { ReviewSession, reviewCounts } = await load('cards/review.ts')
  const { Scheduler } = await load('cards/scheduler.ts')
  const { Knowledge } = await load('knowledge/index.ts')
  const { ladderOf } = await load('challenges/ladder.ts')
  const { planSession } = await load('daily/plan.ts')
  const { wordKey, pairKeys } = await jiti.import(resolve('src/shared/knowledge.ts'))
  const { reviewableNow } = await jiti.import(resolve('src/shared/types.ts'))

  // --- Time: everything is placed on study days counted back from today ---------------------------
  const now = Date.now()
  const today = studyDay(now)
  const dayStart = studyDayEnd(now) - 24 * 3_600_000
  const at = (day, hour, minute = 0) => {
    const [year, month, date] = day.split('-').map(Number)
    return new Date(year, month - 1, date, hour, minute).getTime()
  }
  const ago = (days) => addDays(today, -days)
  const DAY = 24 * 3_600_000

  // The streak: the 13 days before today, one of them missed and covered by a freeze, earlier this
  // week when the week has a day before yesterday (else in last week's days).
  const monday = weekOf(today)
  const frozen = monday < ago(1) ? monday : ago(4)
  const streakDays = Array.from({ length: 13 }, (_, index) => ago(index + 1)).filter(
    (day) => day !== frozen
  )

  // --- Settings -----------------------------------------------------------------------------------
  database()
  new Settings().update({
    language: 'ja',
    level: 0,
    onboarded: true,
    checkpoints: true,
    guessFirst: true,
    wordScript: 'reading',
    reminder: undefined
  })

  // --- Videos and lines -----------------------------------------------------------------------------
  const log = new WatchLog()
  const youtube = (id, title) => ({
    site: 'youtube',
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title
  })
  const mainVideo = youtube(MAIN_ID, MAIN_TITLE)
  // Watched earlier today (never before the study day began, never after now).
  const lastWatched = Math.min(now - 60_000, Math.max(now - 40 * 60_000, dayStart + 10 * 60_000))
  log.noteVideo(youtube(MORE_VIDEOS[1].id, MORE_VIDEOS[1].title), 'ja', 120, at(ago(12), 20))
  log.noteVideo(youtube(MORE_VIDEOS[0].id, MORE_VIDEOS[0].title), 'ja', 60, at(ago(6), 20))
  log.noteVideo(mainVideo, 'ja', 30, at(ago(13), 20))
  for (const video of MORE_VIDEOS)
    log.noteVideo(
      youtube(video.id, video.title),
      'ja',
      video.position,
      at(ago(video.daysAgo), 21, 30)
    )
  log.noteVideo(mainVideo, 'ja', MAIN_POSITION, lastWatched)

  const lines = source.lines.map((row) => {
    const processed = withBases(JSON.parse(row.processed))
    return {
      ...row,
      processed: { ...processed, translation: row.translation ?? processed.translation }
    }
  })
  // Met in the order they are spoken, ending where the learner stopped.
  const metAt = (start) => Math.max(dayStart + 60_000, lastWatched - (MAIN_POSITION - start) * 1000)
  lines.forEach((line, index) => {
    const overlay = {
      id: index + 1,
      original: line.original,
      at: metAt(line.start),
      start: line.start,
      state: 'ready',
      processed: line.processed
    }
    if (!log.noteLine(MAIN_KEY, 'ja', overlay, metAt(line.start)))
      throw new Error(`Line not added: ${line.original}`)
  })
  const lineOf = (original) => {
    const line = lines.find((item) => item.original === original)
    if (!line) throw new Error(`No line: ${original}`)
    return line
  }

  // --- Streak days: watch time, daily sessions and checkpoints ----------------------------------------
  const videoOn = (day) =>
    day >= ago(6) ? `youtube:${MORE_VIDEOS[0].id}` : `youtube:${MORE_VIDEOS[1].id}`
  streakDays.forEach((day, index) => {
    const evening = at(day, 20, 30)
    if (index % 3 === 0) {
      log.addWatchTime(14 * 60_000, videoOn(day), evening)
      log.markSessionDone(evening + 30 * 60_000)
    } else if (index % 3 === 1) {
      log.addWatchTime(6 * 60_000, videoOn(day), evening)
      log.markCheckpointDone(evening + 10 * 60_000)
      log.markCheckpointDone(evening + 20 * 60_000)
    } else log.addWatchTime(18 * 60_000, videoOn(day), evening)
    log.flush(evening + 60 * 60_000)
  })
  // Some watching today already, not yet enough to keep the day.
  log.addWatchTime(3 * 60_000, MAIN_KEY, lastWatched)
  log.flush(lastWatched)

  // --- Cards ---------------------------------------------------------------------------------------------
  const store = new CardStore()
  const reviewSettings = { desiredRetention: 0.9, newPerDay: 10 }
  const scheduler = new Scheduler(reviewSettings)
  const session = new ReviewSession(
    store,
    () => scheduler,
    () => reviewSettings
  )

  const momentOf = (original, takenAt) => {
    const line = lineOf(original)
    const index = lines.indexOf(line)
    return {
      language: 'ja',
      line: {
        id: index + 1,
        original: line.original,
        at: takenAt,
        start: line.start,
        state: 'ready',
        processed: line.processed
      },
      earlier: lines
        .slice(Math.max(0, index - 4), index)
        .map((item) => ({ original: item.original, translation: item.translation })),
      video: {
        site: 'youtube',
        url: mainVideo.url,
        title: MAIN_TITLE,
        id: MAIN_ID,
        position: line.start
      },
      takenAt
    }
  }
  const explanation = (card, { meaning, notice, quote, why, alternative }) => ({
    meaning,
    notice: { text: notice, ...(quote && { quote }) },
    ...(why && { why }),
    ...(alternative && { alternative }),
    card: {
      expression: card.expression,
      meaning: card.meaning,
      target: card.target,
      situation: card.situation ?? ''
    },
    model: MODEL,
    version: 5
  })

  // plan: 'future' (reviewed, next due after today), 'due' (overdue now), 'lapsed' (missed lately,
  // relearning, due now), 'new', 'paused'. `made` is how many days ago it was saved.
  const CARDS = [
    {
      line: '最初のトピックは子供の時の話',
      plan: 'future',
      made: 9,
      word: '子供',
      card: {
        type: 'understand',
        expression: '子供の時',
        reading: 'kodomo no toki',
        meaning: 'childhood; when (someone) was a kid',
        target: '子供の時'
      },
      explain: {
        meaning:
          'They are opening the podcast: "The first topic is about when we were kids." 子供の時 is the everyday way to say "childhood", literally "the time when (I was) a child".',
        notice:
          '子供の時 is a noun phrase you can drop anywhere: 子供の時から (since I was a kid), 子供の時の話 (stories from childhood).',
        quote: '子供の時',
        alternative: {
          expression: '子供の頃',
          changes: 'Means the same, a little softer and more nostalgic.'
        }
      }
    },
    {
      line: 'しゅんはどんな子供でした?',
      plan: 'new',
      made: 2,
      word: 'どんな',
      card: {
        type: 'understand',
        expression: 'どんな子供でした?',
        reading: 'donna kodomo deshita',
        meaning: 'What kind of kid were you?',
        target: 'どんな'
      },
      explain: {
        meaning:
          'Okkei asks Shun, "What kind of kid were you?" A friendly, open question that invites a story.',
        notice:
          'どんな + noun asks "what kind of …": どんな人 (what kind of person), どんな映画 (what kind of film).',
        quote: 'どんな',
        why: 'She uses his name and polite でした, so it is warm but still polite on camera.'
      }
    },
    {
      line: 'でも他の人が見たら純粋だったって思われたかも',
      plan: 'future',
      made: 8,
      word: '純粋',
      card: {
        type: 'understand',
        expression: '純粋',
        reading: 'junsui',
        meaning: 'pure, innocent, genuine',
        target: '純粋'
      },
      explain: {
        meaning:
          '"But to other people, I might have seemed innocent." He is joking that his childhood mischief could look pure from the outside.',
        notice:
          '純粋 (junsui) is a な-adjective for something pure or innocent; 純粋な子供 is "an innocent child". The line ends in かも, short for かもしれない: "maybe".',
        quote: '純粋だった',
        alternative: {
          expression: '無邪気だった',
          changes: 'Closer to "carefree, innocent like a child"; 純粋 is more "pure-hearted".'
        }
      }
    },
    {
      line: '多分生きてきたからずっと変わらなかったかも',
      plan: 'future',
      made: 6,
      word: '変わる',
      card: {
        type: 'understand',
        expression: 'ずっと変わらなかった',
        reading: 'zutto kawaranakatta',
        meaning: 'never changed, stayed the same all along',
        target: '変わらない'
      },
      explain: {
        meaning:
          'Shun explains why he hasn\'t changed: "Probably because I lived that way, I never changed."',
        notice:
          '変わらない is the negative of 変わる (to change); with ずっと it means "has stayed the same all along". かも at the end softens it to "maybe".',
        quote: '変わらなかった',
        why: 'It answers the earlier question "みんなどうやって変わるんですかね" (how does everyone change?).'
      }
    },
    {
      line: '大人になっていないと思います',
      plan: 'due',
      made: 13,
      word: '大人になる',
      card: {
        type: 'understand',
        expression: '大人になっていない',
        reading: 'otona ni natte inai',
        meaning: "(I) haven't grown up",
        target: '大人になる'
      },
      explain: {
        meaning:
          'Shun laughs at himself: "I don\'t think I\'ve grown up." He means he is still a kid at heart, not that he is young.',
        notice:
          '大人になる is "to become an adult, to grow up"; なっていない is its "still not" form: "haven\'t grown up (yet)".',
        quote: '大人になっていない',
        alternative: {
          expression: 'まだ子供です',
          changes: '"I\'m still a kid": more direct, same playful feeling.'
        }
      }
    },
    {
      line: 'お金は人を絶対幸せには',
      plan: 'lapsed',
      made: 12,
      word: '幸せにする',
      card: {
        type: 'understand',
        expression: 'お金は人を絶対幸せにはしてくれない',
        reading: 'okane wa hito o zettai shiawase ni wa shite kurenai',
        meaning: 'Money will never make people happy.',
        target: '幸せにする'
      },
      explain: {
        meaning:
          'Over two caption lines: "Money absolutely won\'t make people happy." A strong opinion, said as something he has been told many times.',
        notice:
          '幸せにする is "to make (someone) happy"; くれない adds "won\'t do it for you", and 絶対 + negative is "never, absolutely not".',
        quote: '幸せには',
        why: 'The line before, お金は必要だけど, sets up the contrast: money is necessary, but…'
      }
    },
    {
      line: 'お金は必要だけど',
      plan: 'new',
      made: 1,
      word: '必要',
      card: {
        type: 'understand',
        expression: 'お金は必要だけど',
        reading: 'okane wa hitsuyou dakedo',
        meaning: 'Money is necessary, but…',
        target: '必要'
      },
      explain: {
        meaning:
          '"Money is necessary, but…" The sentence stops on だけど to set up a contrast that comes next.',
        notice:
          '必要 (hitsuyou) means "necessary"; だけど at the end is a casual "but…", leaving the other side for the next line.',
        quote: '必要'
      }
    },
    {
      line: 'みんなと同じ生き方をしていないから',
      plan: 'due',
      made: 12,
      word: '生き方',
      card: {
        type: 'understand',
        expression: '生き方',
        reading: 'ikikata',
        meaning: 'way of life, how one lives',
        target: '生き方'
      },
      explain: {
        meaning:
          '"Because I don\'t live the same way as everyone else." Shun says his life has not followed the usual path.',
        notice:
          '生き方 is 生きる (to live) + 方 (way of doing): "a way of living". The same pattern gives 話し方 (way of speaking) and 食べ方 (way of eating).',
        quote: '生き方',
        alternative: {
          expression: 'みんなと違う生活をしている',
          changes: '生活 is daily life; 生き方 is more about choices and values.'
        }
      }
    },
    {
      line: 'どういう意味ですか',
      plan: 'due',
      made: 13,
      word: 'どういう意味',
      card: {
        type: 'use',
        expression: 'どういう意味ですか',
        reading: 'dou iu imi desu ka',
        meaning: 'What do you mean?',
        target: 'どういう意味',
        situation:
          "A friend says something you don't quite get, and you want them to explain what they meant."
      },
      explain: {
        meaning:
          'Okkei asks Shun, "What do you mean?" after he says he didn\'t live within society. Curious, not confrontational.',
        notice:
          'どういう意味ですか asks for the meaning behind what someone said; with friends, どういう意味? alone is enough.',
        quote: 'どういう意味'
      }
    },
    {
      line: 'よろしくお願いします',
      plan: 'paused',
      made: 7,
      word: 'よろしくお願いします',
      card: {
        type: 'use',
        expression: 'よろしくお願いします',
        reading: 'yoroshiku onegaishimasu',
        meaning: 'Nice to meet you / I look forward to working with you.',
        target: 'よろしくお願いします',
        situation:
          'You have just introduced yourself at the start of a podcast, a class or a new job.'
      },
      explain: {
        meaning:
          'The hosts greet each other at the start of the episode: "Nice to meet you, let\'s do this well together."',
        notice:
          'よろしくお願いします closes an introduction and asks for goodwill in what comes next; there is no single English match.',
        quote: 'よろしくお願いします'
      }
    }
  ]

  let eventId = 0
  const nextEvent = () => `demo-review-${++eventId}`
  // A day the learner reviewed: not the missed day, never today.
  const reviewDayOf = (time) => {
    const day = studyDay(time)
    return day === frozen ? addDays(day, 1) : day
  }
  const reviewDays = new Set()
  const rate = (card, time, pick) => {
    const shown = session.present(card.id, time)
    const rating = pick(shown.outcomes)
    session.commitRating(card.id, shown.card.revision, rating, nextEvent(), time)
    reviewDays.add(studyDay(time))
    return store.get(card.id)
  }

  // Reviews a card on evenings when it is due, until a rating makes it due between `from` and `to`
  // (overdue then, and still remembered well). Ratings that land too early make progress; the card
  // stops where it is when no rating can land before `to`.
  const steer = (card, from, to) => {
    for (let step = 0; step < 8 && card.due < from; step++) {
      const options = []
      for (let day = reviewDayOf(card.due); day < today; day = addDays(day, 1)) {
        if (day === frozen) continue
        const reviewAt = Math.max(card.due, at(day, 20, 15))
        const { outcomes } = session.present(card.id, reviewAt)
        for (const rating of ['easy', 'good', 'hard'])
          options.push({ reviewAt, rating, due: outcomes[rating].due })
      }
      const chosen =
        options.find((option) => option.due >= from && option.due < to) ??
        options.filter((option) => option.due < from).sort((a, b) => b.due - a.due)[0]
      if (!chosen) break
      card = rate(card, chosen.reviewAt, () => chosen.rating)
    }
    return card
  }

  const saved = []
  for (const item of CARDS) {
    const madeDay = ago(item.made) === frozen ? ago(item.made - 1) : ago(item.made)
    const madeAt = at(madeDay, 20, 40)
    const moment = momentOf(item.line, madeAt)
    const draft = {
      ...item.card,
      language: 'ja',
      source: { kind: 'video', moment },
      explanation: explanation(item.card, item.explain),
      wordKey: wordKey('ja', item.word)
    }
    const result = store.save(draft, scheduler, { now: madeAt })
    if (!('saved' in result)) throw new Error(`Card not saved: ${item.card.expression}`)
    let card = result.saved
    log.noteWord(
      {
        kind: 'explained',
        videoKey: MAIN_KEY,
        language: 'ja',
        text: item.line,
        line: item.line,
        start: moment.line.start
      },
      madeAt - 60_000
    )
    log.noteWord(
      {
        kind: 'saved',
        videoKey: MAIN_KEY,
        language: 'ja',
        text: item.card.expression,
        line: item.line,
        start: moment.line.start
      },
      madeAt
    )
    saved.push({ item, card })
    if (item.plan === 'new') continue

    // Learnt on the day it was saved: Good, then Good again after the 10-minute step.
    card = rate(card, madeAt + 60_000, () => 'good')
    card = rate(card, card.due + 5 * 60_000, () => 'good')
    // Then reviewed on the evening of each day it came due, never today.
    if (item.plan === 'future' || item.plan === 'paused') {
      // Reviewed on the evening of each day it came due, the last time so it is next due after today.
      while (card.due < dayStart) {
        const reviewAt = Math.max(card.due, at(reviewDayOf(card.due), 20, 15))
        const { outcomes } = session.present(card.id, reviewAt)
        const landsToday = outcomes.good.due >= dayStart && outcomes.good.due < studyDayEnd(now)
        card = rate(card, reviewAt, () => (landsToday ? 'easy' : 'good'))
      }
    } else if (item.plan === 'lapsed') {
      // Came due in the last few days, then missed (Again) yesterday: relearning, due now.
      card = steer(card, dayStart - 5 * DAY, dayStart - 2 * 3_600_000)
      card = rate(card, Math.max(card.due, at(ago(1), 20, 15)), () => 'again')
    } else card = steer(card, dayStart - 2 * DAY, dayStart)
    if (item.plan === 'paused')
      store.setPaused(card.id, true, (card.lastReview ?? madeAt) + 3_600_000)
  }
  // A review day is a day the daily session was done.
  for (const day of reviewDays) if (streakDays.includes(day)) log.markSessionDone(at(day, 21, 45))

  // --- The knowledge ladder ----------------------------------------------------------------------------
  const knowledge = new Knowledge()
  // Lines with the jokes the demo leaves alone stay out of the earlier sightings and the practice.
  const JOKES = ['浣腸', '痔', 'お尻', 'いたずら']
  const clean = lines.filter((line) => !JOKES.some((word) => line.original.includes(word)))
  // Seen in earlier videos too, then all of them in today's.
  for (const line of clean) knowledge.noteSeen('ja', line.processed, at(ago(11), 20, 50))
  for (const line of clean.slice(0, 20)) knowledge.noteSeen('ja', line.processed, at(ago(5), 21))
  for (const line of lines) knowledge.noteSeen('ja', line.processed, metAt(line.start))

  const key = (word) => wordKey('ja', word)
  const USABLE = ['子供', '話', 'みんな', '友達']
  const SPEAKABLE = [
    '変わる',
    '最初',
    'トピック',
    '思う',
    '同じ',
    '多分',
    'ずっと',
    '本当に',
    '生まれる',
    'あまり'
  ]
  // Known by recalls (cards make 純粋, 大人になる, 生き方, どういう意味 known by memory).
  const KNOWN = [
    '純粋',
    '大人',
    '何回も',
    '言われる',
    '人',
    '絶対',
    '僕',
    '寿司',
    '言う',
    'こんにちは',
    '今',
    'いい',
    'どんな',
    '元気',
    'なんか',
    'そうなんですね',
    'へー',
    'そう',
    '悪い',
    'わかる',
    'こんな',
    'うん',
    'そっか',
    'おじいさん',
    'どうやって',
    'そうですね',
    '生きる',
    'かもしれない',
    '他の人',
    '思われる',
    '結構',
    '高校',
    'あれ'
  ]
  const met = new Set(
    lines.flatMap((line) => pairKeys('ja', line.processed).map((word) => word.key))
  )
  for (const word of [...USABLE, ...SPEAKABLE, ...KNOWN])
    if (!met.has(key(word))) throw new Error(`Not a word in the lines: ${word}`)
  const attempts = (words, kind, context) =>
    words.map((word) => ({
      key: key(word),
      kind,
      good: true,
      ...(context && { context: context(word) })
    }))
  const climbing = [...KNOWN, ...SPEAKABLE, ...USABLE]
  // Recalled right on two days, said well on two days, used well in two sentences of their own.
  knowledge.noteAttempts('ja', attempts(climbing, 'recall'), at(ago(9), 21))
  knowledge.noteAttempts('ja', attempts(climbing, 'recall'), at(ago(4), 21))
  knowledge.noteAttempts('ja', attempts([...SPEAKABLE, ...USABLE], 'say'), at(ago(6), 21, 10))
  knowledge.noteAttempts('ja', attempts([...SPEAKABLE, ...USABLE], 'say'), at(ago(2), 21, 10))
  const SENTENCES = {
    子供: ['子供の時、サッカーが好きでした。', '私の子供はまだ小さいです。'],
    話: ['友達と旅行の話をしました。', 'その話、もう一回聞きたいです。'],
    みんな: ['みんなで日本に行きたいです。', 'みんなと同じ電車に乗りました。'],
    友達: ['友達と毎週ご飯を食べます。', '大学の友達に会いました。']
  }
  for (const [index, days] of [3, 1].entries())
    knowledge.noteAttempts(
      'ja',
      attempts(USABLE, 'use', (word) => SENTENCES[word][index]),
      at(ago(days), 21, 20)
    )
  // Words looked at in today's video: the daily session starts from them.
  for (const text of ['子供の時', 'お金', '幸せには'])
    log.noteWord(
      {
        kind: 'hovered',
        videoKey: MAIN_KEY,
        language: 'ja',
        text,
        line: lines.find((line) => line.original.includes(text))?.original
      },
      lastWatched - 5 * 60_000
    )

  // --- What the app will read: checked and printed -------------------------------------------------
  const check = (ok, message) => {
    if (!ok) throw new Error(`Demo profile check failed: ${message}`)
  }
  const streak = log.streak(now)
  const week = log.week(now)
  const counts = reviewCounts(reviewSettings.newPerDay, now)
  const byPlan = (plan) => saved.filter(({ item }) => item.plan === plan).length
  const cardRows = database()
    .prepare('SELECT state, paused, due FROM cards WHERE deleted_at IS NULL')
    .all()
  const reviews = database().prepare('SELECT COUNT(*) n, MIN(study_day) first FROM reviews').get()
  const future = cardRows.filter(
    (row) => row.state !== 0 && !row.paused && row.due >= studyDayEnd(now)
  ).length
  const summary = knowledge.summary('ja', now)
  const hover = [
    '子供',
    '大人',
    '大人になる',
    '変わる',
    '純粋',
    '幸せ',
    '幸せにする',
    'お金',
    '友達',
    '生き方',
    '話'
  ]
  const hoverStates = knowledge.statesFor('ja', hover.map(key), now)
  const videos = log.recentVideos(3)
  const lastVideo = log.lastVideo()
  const plan = planSession({
    due: reviewableNow(counts),
    lines: lastVideo.lines,
    words: lastVideo.words,
    random: () => 0,
    stateOf: ladderOf(knowledge, 'ja', lastVideo.lines)
  })

  check(cardRows.length === 10, `10 cards (${cardRows.length})`)
  check(counts.due === 4, `4 cards due (${counts.due})`)
  check(future === 3, `3 cards due after today (${future})`)
  check(cardRows.filter((row) => row.state === 0).length === 2, '2 new cards')
  check(cardRows.filter((row) => row.paused).length === 1, '1 paused card')
  check(
    streak.days === 12 && !streak.keptToday,
    `12-day streak to yesterday (${JSON.stringify(streak)})`
  )
  check(videos.length === 3 && videos[0].key === MAIN_KEY, 'three videos, the main one first')
  check(lastVideo.lines.length === 40 && lines.length === 48, '48 lines kept')
  check(
    summary.counts.known >= 30 && summary.counts.known <= 40,
    `30–40 known (${summary.counts.known})`
  )
  check(
    summary.counts.speakable >= 8 && summary.counts.speakable <= 12,
    `8–12 speakable (${summary.counts.speakable})`
  )
  check(
    summary.counts.usable >= 3 && summary.counts.usable <= 5,
    `3–5 usable (${summary.counts.usable})`
  )
  check(
    hoverStates[key('純粋')] === 'known' &&
      hoverStates[key('変わる')] === 'speakable' &&
      hoverStates[key('子供')] === 'usable',
    '純粋 known, 変わる speakable, 子供 usable'
  )

  const dots = { kept: '●', frozen: '❄', missed: '○', today: '◎', ahead: '·' }
  console.log(`Duet demo profile: ${folder}`)
  console.log(
    `  Settings   Japanese, Auto level, onboarded, checkpoints on, hide English until I look, Latin letters, no reminder`
  )
  console.log(
    `  Streak     ${streak.days} days to yesterday (today not kept yet), freezes left this week: ${streak.freezesLeft}`
  )
  console.log(
    `  This week  ${week.map((day) => `${day.day.slice(5)} ${dots[day.state]}`).join('  ')}  (missed day covered: ${frozen})`
  )
  console.log(
    `  Cards      10: ${counts.due} due now, ${future} due after today, ${counts.newAvailable} new, 1 paused; ${reviews.n} reviews since ${reviews.first}`
  )
  console.log(`             Review shows ${reviewableNow(counts)} (due + new allowed today)`)
  console.log(
    `  Words      known ${summary.counts.known}, can say ${summary.counts.speakable}, can use ${summary.counts.usable}, seen ${summary.counts.encountered}, ignored ${summary.counts.ignored}`
  )
  console.log(`  Hover      ${hover.map((word) => `${word} ${hoverStates[key(word)]}`).join(', ')}`)
  console.log(
    `  Videos     ${videos.map((video) => `${video.videoId} @${Math.round(video.position ?? 0)}s`).join(', ')}`
  )
  console.log(
    `  Today      say back: ${plan.say?.original ?? '(none)'}; challenge: ${plan.challenge?.kind ?? '(none)'}`
  )
  check(byPlan('due') + byPlan('lapsed') === 4, 'four cards planned due')
} finally {
  rmSync(fakeFolder, { recursive: true, force: true })
}
