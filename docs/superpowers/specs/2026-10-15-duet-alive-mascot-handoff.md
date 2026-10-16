# Duet, alive: porting the new mascot into the app

Status: prototype agreed in chat on 2026-10-14/15. This is the handoff for implementing it.

## Intent

Duet's current mascot (`Mascot.tsx` + `mascot.css`) is the old glass-socket design animated with CSS
keyframe loops: each state repeats the same motion, and states jump into each other. Replace it with
the new design (squircle eyes, pill pupils, offset smile: see `app/build/icon-source/`) driven by a
procedural animation engine, so Duet feels alive and responsive in conversation: nothing loops,
everything eases, and it reacts to the learner.

**Source of truth:** `visualizations/duet-alive.html`. One self-contained file; open it in a
browser and use its controls. Every behaviour below is implemented there. Port its behaviour, its
numbers and its decisions; do not redesign. Where this document and the file disagree, the file
wins. (The `visualizations/` folder is not committed yet: commit it, or copy the file somewhere the
implementer can read it.)

## What to keep from the prototype, and what not to port

Port: the engine, every expression, gestures, sleep/peek/wake, hands, brows, cheek lines, colour
pops ("In the face" mode), the frosted-glass finish (with its glow) and the flat finish.

Do not port (they are demo scaffolding): the page layout and buttons, the scripted conversation,
the simulated user voice and simulated speech babble (replaced by real audio, below), the mic demo,
the "Behind Duet" scenes, the "Around" colour-pop mode (the glow/ring outside Duet), and the
option toggles (they become props or app settings).

## Architecture

```
components/duet/
  engine.ts        springs, offsets, gestures, blinks, gaze, moods, sleep — plain TS, no React
  render.ts        writes the SVG every frame (squircle, mouth path, lids, pupils, hands, brows…)
  moods.ts         the MOODS table, TONES, POSES, colour map (data, no logic)
  DuetMascot.tsx   React wrapper: mounts the SVG once, owns one engine, feeds it props
```

- **One engine instance per mounted mascot**, created in a ref, started in an effect, stopped on
  unmount (cancel its `requestAnimationFrame`).
- **The frame loop runs outside React.** React renders the SVG skeleton once; the engine writes
  attributes directly each frame through the cached `attr()` helper (only writes on change). Never
  put per-frame values in React state; that would re-render 60 times a second.
- **Props → engine calls:** `state` → `engine.setState(state, { tone })`; one-off events
  (`engine.pop()`, `engine.gesture('wave')`, `engine.wake()`) via an imperative ref handle.
- **Size:** the prototype draws in a 100 × 66 viewBox (`0 17 100 66`); scale with CSS width like the
  current `scale` prop. Keep the face coordinates exactly as in the prototype (they are measured from
  the icon SVG).

## State mapping

The app's `MascotState` today: `idle | listening | thinking | speaking | success | correction`.
Map, and extend:

| App today | Prototype mood | Notes |
|---|---|---|
| `idle` | `asleep` or `idle` (awake) | Where Duet waits (Talk tile, home): `asleep`. Inside a live conversation between turns: `idle`. |
| `listening` | `listening` | Waking from sleep goes into this (see Sleep). |
| `thinking` | `thinking` | |
| `speaking` | `speaking` + tone | Tones: `warm` (default), `excited`, `gentle` (use `gentle` for a correcting reply). |
| `success` | `correct` | Use `amazed` ("Can't believe it!") for a standout answer, then `correct`. |
| `correction` | `almost` | `oops` exists for a real mistake; prefer `almost` (kinder). |

Feelings (`surprised, confused, curious, laughing, shy, sleepy, sad, adoring, determined`) and
`proud, encourage` are new; expose them in the type even if nothing uses them yet.
`voiceMascotState()` in `explain/voice/status.ts` and `mascotState()` in `Conversation.tsx` need
updating to the new names.

## Systems (all in the prototype; port faithfully)

1. **Springs.** Every value chases a target with a damped spring (`S(name, x, k, c)`), stepped at a
   fixed 120 Hz inside the frame. The right eye's springs are 14% softer so the eyes never move as
   mirror copies. Keep the stiffness/damping numbers as they are; they were tuned by eye.
2. **Additive gestures.** One-shots (`nod, mmhm, yes, no, hop, surprise, flinch, giggle, hmm, wave,
   wink, yawn, wake`) write offsets on top of the springs; each run gets a random ±12% speed and
   ±15% size. Nod and shake are **pitch/yaw** (features slide with parallax; the pupils counter-move
   to keep eye contact) — not a plain up/down or left/right slide.
3. **Gaze.** Saccades with holds, fixational micro-saccades, scripted look-arounds, eyes lead and
   the head follows a beat later, perspective on head turns. `USER = {x: -0.3, y: 0.5}` is eye
   contact (the icon's pupil position). Follows the cursor when it moves (except where a mood sets
   `noPointer`).
4. **Pupils.** Clamped inside the eye's own superellipse (not a box), below a lowered lid, with a
   soft stop near the rim (`PEEK = 0.14`): they may only slightly overlap the edge. Pupil size is
   capped to the eye. They stretch slightly along fast saccades and fade when the eye is shut or in
   a smile arch.
5. **Blinks.** Scripted (not springs), irregular, sometimes double, slower for calm moods; often on
   big gaze shifts and on state changes.
6. **Shape morphs.** Per eye: width, height, squircle exponent `eyeN` (2 round … 3.4 icon … 5 boxy),
   rotation (mirrored: positive lowers inner corners), lid amount and tilt, happy arch, vertical
   offset; pupil size and pill/dot ratio. Keys without L/R apply to both eyes.
7. **Mouth.** One path built from width, smile (negative = frown), open, round, tilt. Speaking:
   per-syllable vowel shapes.
8. **Hands.** Two pill hands, poses in `POSES`, every pose clear of the eyes. A pose change of more
   than 14 units goes **via the lower-corner tuck spots** (`TUCK`) so hands never sweep across the
   face; they also enter and leave from there. Outlined with the background colour so overlapping
   hands stay distinct.
9. **Brows.** Default "strong emotions only": drawn on like a pen stroke (stroke-dashoffset, from
   the inner end) for `brow: 1` moods and on a poke, drawn back off afterwards. They take their tilt
   and height from the eye (lid, rotation, openness); no separate brow animation.
10. **Cheeks.** Three hatch lines plus a very faint glow (`blush * 0.12`). Positioned below the eye's
    actual lower edge; both sides fade together when any hand comes within ~8 units.
11. **Sleep.** Default when idle: eyes shut to lines, slow deep breathing, small breathing mouth,
    drifting z's. Cursor on the face (after 0.15 s) → one eye peeks, then both drowsily after 1.3 s;
    leaving → lingers 0.8 s, then dozes. Click → `wake()`: crouch, stretch up, eyes pop open (shut
    spring temporarily stiffened), brow lift, blink, then `listening`, with a teal colour pop. Any
    other state requested while asleep wakes first. After 30 s with no activity (no speech, no
    pointer, no input) Duet yawns and falls asleep.
12. **Colour pops, in the face.** Each emotion flushes the eyes, hands and brows with its colour
    (`POPS`, `HUE`): quick (0.15 s rise, 1.4 s fade) or slow (0.55 s / 2.6 s) for sad, sleepy, shy,
    adoring, thinking. Peak mix 68 % (dark) / 54 % (light), via the `--gc` colour-mix on the SVG.
    The glow brightens with the pop (`--g-boost`). Routine states (listening, speaking, awake,
    asleep) never pop; teal on waking always means "listening". Mistakes never get red.
13. **Finishes.** *Frosted glass* (recommended for the mascot): one layer, body at `--g-body`
    opacity, fine continuous grain + soft cloudy milkiness (two pattern tiles, drawn once), a tight
    glow drawn from the finished eye (filter on a wrapper outside the mask). *Flat*: the icon look,
    for small sizes (tray, favicon, Talk tile at 0.2×).
14. **Hand-made feel.** Each eye's outline has a fixed slight unevenness (seeded per eye, computed
    once into a lookup table). Paper grain only on flat. No line boil, no "on twos" (both rejected).
15. **Themes.** Dark: light eyes, dark pupils. Light: dark eyes, light pupils. All colours are CSS
    variables; switching theme is instant for the face (no transitions on the fills: they would
    smear the colour pops).
16. **Reduced motion.** `M = 0.3` scales all motion amplitudes; keep blinks and speech; no hops.

## Real speech instead of the simulated babble

The prototype's `Babble` class fakes syllables. In the app, drive the mouth from Duet's real voice:
`useSpeechMouth` already reads a loudness envelope from `speechAudio` (the playback element's
stream). Feed that level into the engine every frame as the speech envelope (mouth open). Keep from
the prototype: the vowel-shape variation (pick a new shape when the level rises from a trough), the
stressed-beat nods/eye widening on loud onsets, and the glance-away at phrase starts (a phrase
starts after ~300 ms of silence). Delete the CSS-based `useSpeechMouth` painting; keep only its
audio analysis.

Listening backchannel (nods and "mm-hm" at the learner's pauses) needs the learner's voice level;
if the live tutor exposes the mic level, feed it the same way; otherwise skip it for now.

## Decisions already made (do not undo)

- **No backdrop-blur layer for the frost.** It was tried three ways and rejected: a separate blur
  element cannot stay locked to the morphing eyes (it visibly drifts), Chromium's
  `backdrop-filter` ignores SVG `url()` clip-paths, needs a painted background to work at all, and
  leaks a `polygon()` clip to its bounding box. And in the app it could not blur another app's video
  anyway (it only sees Duet's own window). The frost is the one-layer body + grain + milkiness.
- **No gradients, bevels, shine blobs or glints** on the glass. Tried; they read as fake.
- **No clear "liquid glass" lenses.** Tried; they change Duet's identity (pupils would have to
  become the bright part).
- **Blush is hatch lines + a faint glow**, not a soft pink blob (looked fake).
- **Idle is sleep**, not an awake loop.

## Open questions (decide before shipping)

1. **Bright backgrounds.** In dark mode over a white or very bright video, the eyes rely only on the
   frost's grey to separate from the picture; the pale mouth nearly disappears and the white glow
   does nothing. Options: a soft dark shadow under Duet always, or switch Duet to its light-mode
   colours over bright content (Duet can't see what's behind its window, so this is a setting or a
   fixed choice). Check with the prototype's "Behind Duet: Bright / White".
2. **Waitlist landing page** has its own copy of the mascot (`waitlist/app/mascot.css`). Port there
   too, or keep the old one until launch?
3. **The old opening animation** (the mark separating into the face, `opening` prop) has no
   equivalent yet. Keep a simple version, or let the wake-up be the opening?

## Acceptance

- Every mood, gesture and transition in the prototype looks the same in the app (compare side by
  side with `visualizations/duet-alive.html`).
- Switching states never snaps; hands never cross the eyes; pupils never leave the eye except the
  small allowed peek; brows never appear on routine states in "strong emotions" mode.
- Sleep → peek → wake → listening works with the cursor in the welcome window; the Talk tile shows
  a sleeping Duet.
- Speaking follows the real voice; the mouth is closed between phrases.
- 60 fps with two mascots on screen; no React re-render per frame; the loop stops on unmount and
  when the window is hidden.
- Reduced motion: barely moving, still blinking and speaking.
- Dark and light themes, flat and frosted, at 0.2×, 0.3×, 0.5× and 1×.

## Suggested order

1. Engine + render as plain TS, mounted by `DuetMascot.tsx` in the welcome window only; compare
   with the prototype.
2. Moods and gestures; state mapping; swap `Mascot` for `DuetMascot` in `Conversation`,
   `TalkBubble`, `TalkTile`, `Welcome`.
3. Real speech mouth from `useSpeechMouth`'s envelope.
4. Sleep/peek/wake (welcome, Talk tile), colour pops, finishes.
5. Remove the old `Mascot.tsx` / `mascot.css` once nothing imports them.
