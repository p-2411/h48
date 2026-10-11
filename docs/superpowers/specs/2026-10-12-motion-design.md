# Motion in Duet

Status: agreed in chat on 2026-10-12, for review as written.

## Intent

Today almost everything in Duet appears and disappears at once. Motion should explain what happened
(something opened, came in, left, moved) and never perform. The feel is **calm and native**, like
macOS: short, soft, settled. Watching must still not feel like studying: over the video, motion
stays small.

Success: nothing that opens, closes or changes size blinks or jumps; nothing loops except what
already does (the mascot, the checkpoint glow, the status dot); people who ask their system for
reduced motion see no movement.

## Decisions

- **Library:** Motion (`motion`, the successor of Framer Motion), pinned at **13.4.4** (the latest
  release at least two weeks old; React 19 is supported). The mascot keeps its own CSS animations.
- **Line change on the strip:** the new line **rises in** (about 4 px, with a fade); the old one
  fades out quickly; the strip's width and height glide to the new size.

## 1. Shared base: `src/renderer/src/components/motion/`

- **Tokens**
  - Durations: `fast` 120 ms (hover, press, small fades), `base` 200 ms (things that open and close),
    `slow` 280 ms (panels, whole places).
  - Exits run at about 70% of the entrance's length.
  - Easing: ease-out (the app's `--ease`, `cubic-bezier(0.16, 1, 0.3, 1)`) for entering, ease-in
    for leaving; one gentle spring for things that open, with no visible overshoot.
  - Distance: slides of 4–8 px; scale-in from 0.96.
- **Presets**, used everywhere instead of one-off values: `fadeUp` (rise in), `pop` (scale and fade,
  from the side it opens from), `fade`, and `glide` (a layout size change).
- **Reduced motion:** set once at the top of each window (Motion's reduced-motion setting), so
  things appear and leave with at most a quick fade, and nothing slides, scales or glides.
- **Exits:** what leaves animates out before it is removed (`AnimatePresence`).

## 2. The strip

- **A new line** rises in (about 4 px, fade, about 180 ms); the old line fades out quickly; the
  strip's width and height glide to the new line's size.
- **The hover row, the word card, the ⚙ popover, the checkpoint card, the talk bubble, toasts and
  notices** each pop in from where they open (the word card from its word, the popover from ⚙, the
  bubble from the strip) and fade out when they leave, so nothing blinks off.
- **The level row** opens out from its number and folds back into it.
- **The checkpoint glow** stays as it is. (Redesigned later, separately: a flowing Apple Intelligence light behind the strip.)

## 3. The side panel

- **Switching tabs** (Script, Explain): a quick crossfade.
- **Explain:** the explanation rises in when it arrives; conversation turns rise in as they come
  (voice turns too); card previews and notices pop in.
- **Script:** the highlight on the line being spoken glides from row to row.

## 4. The home base, the daily session and welcome

- **Switching places:** the new page fades and rises in (about 8 px).
- **My cards:** the selection highlight glides along the list; a deleted card collapses out, and an
  undone one comes back in.
- **The daily session:** each step slides in from the right as the last leaves to the left; the
  streak number counts up on the end screen.
- **Welcome:** its steps slide like the daily session's.

## Out of scope

Anything over the video beyond the above; staggered lists; new loops; changes to the mascot's own
animations.

## Checks

- Every animated element still works with reduced motion (asked for in the system, and emulated in
  the browser): no slide, scale or glide.
- Nothing that leaves blocks the next thing: a word card closing doesn't stop another opening; a
  popover closing doesn't hold the strip's clicks.
- The strip's line change and size glide stay smooth while a video plays (no dropped frames
  visible on a 60 Hz screen).
- The existing tests, typecheck, lint and build stay green; the layout sweep stays clean.
