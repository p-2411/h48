import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const testDir = mkdtempSync(join(tmpdir(), 'duet-smoke-'))
const bundlePath = join(testDir, 'database.mjs')
const databasePath = join(testDir, 'duet.sqlite')

try {
  await build({
    entryPoints: ['src/main/database.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    external: ['node:sqlite'],
    logLevel: 'silent'
  })

  const { DuetDatabase } = await import(pathToFileURL(bundlePath).href)
  const database = new DuetDatabase(databasePath)
  const card = database.createCard({
    expression: 'ていうか、別にそういうつもりじゃなかったんだけど。',
    reading: 'ていうか、べつにそういうつもりじゃなかったんだけど。',
    meaning: 'I mean, it’s not like I intended it that way.',
    target: 'ていうか redirects or softens what came before.',
    context: '急に黙ったから、怒ってるのかと思った。え、違うよ。',
    cardType: 'understand',
    sourceType: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=duet-smoke',
    videoTitle: 'Smoke test fixture',
    sourceTimestamp: 107,
    provenance: 'reviewed-demo:smoke'
  })

  assert.equal(database.listCards().length, 1)
  assert.equal(database.getReviewQueue().cards.length, 1)
  assert.equal(database.previewReview(card.id).length, 4)

  const reviewed = database.reviewCard({
    cardId: card.id,
    expectedRevision: card.revision,
    eventId: 'smoke-review-1',
    rating: 'good'
  })
  assert.equal(reviewed.scheduler.reps, 1)
  assert.equal(reviewed.revision, 2)

  const restored = database.undoLatestReview(card.id)
  assert.equal(restored.scheduler.reps, 0)
  assert.equal(restored.latestReview?.undone, true)

  const backup = JSON.parse(database.exportBackup())
  assert.equal(backup.format, 'duet-backup')
  assert.equal(backup.cards.length, 1)
  assert.equal(backup.reviews.length, 1)
  database.close()

  console.log('Duet database smoke test passed: create, queue, preview, rate, undo, backup.')
} finally {
  rmSync(testDir, { recursive: true, force: true })
}
