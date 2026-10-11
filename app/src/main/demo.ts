// Demo fixtures, for showing the voice tutor on a machine with no caption reader. With
// DUET_DEMO_FIXTURES=1, Duet seeds two labelled Japanese cards into an empty collection, uses a
// labelled Japanese line when no line is on screen, and opens the tutor at launch.
import type { Moment } from '../shared/moment'

/** Read when asked, not on import: app/.env.local is loaded after the modules are. */
export function demoEnabled(): boolean {
  return process.env.DUET_DEMO_FIXTURES === '1'
}

export function demoMoment(): Moment {
  return {
    language: 'ja',
    line: { id: -1, original: 'ていうか、別にそういうつもりじゃなかったんだけど。', at: Date.now(), state: 'ready' },
    earlier: [
      { original: '（デモ用の例文）', translation: 'Labelled demo fixture.' },
      { original: '怒ってるの？', translation: 'Are you angry?' }
    ],
    video: { site: 'youtube', url: 'fixture:duet-japanese-nuance', title: 'Labelled Duet demo', position: 42 },
    takenAt: Date.now()
  }
}
