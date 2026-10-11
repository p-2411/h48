// Checks the player's holds and replays (main/player.ts). Run: npx jiti scripts/test-player.mjs
import { Player } from '../src/main/player.ts'

const check = (ok, what) => {
  if (!ok) throw new Error(what)
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const time = (t, playing) => ({ t, playing, ad: false, at: Date.now() })

// The tutor holds a playing video, the learner replays a line, then closes the tutor: the video
// plays on, and nothing pauses it at the line's end (no hold is left to keep).
{
  const sent = []
  const player = new Player((command) => sent.push(command.type))
  player.update(time(10, true))
  player.hold('tutor')
  player.update(time(10, false))
  player.replay(12, 14)
  player.update(time(12, true))
  await wait(250)
  player.release('tutor')
  const afterRelease = sent.length
  player.update(time(15, true))
  await wait(250)
  check(sent.slice(afterRelease).every((type) => type !== 'pause'), 'a replay paused the video after the last hold was released')
}

// Replaying while the learner had paused the video still pauses again at the line's end.
{
  const sent = []
  const player = new Player((command) => sent.push(command.type))
  player.update(time(20, false))
  player.replay(22, 24)
  player.update(time(22, true))
  await wait(250)
  player.update(time(25, true))
  await wait(250)
  check(sent.at(-1) === 'pause', 'a replay of a paused video did not pause again at the line end')
}

console.log('Player test passed.')
process.exit(0)
