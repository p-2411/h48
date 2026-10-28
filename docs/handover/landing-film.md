# Handover: the landing page's product film (2026-10-28)

Branch `demo`. The film was reworked on 2026-10-28 to match how Duet really behaves, from running
the app here. That work is in the working tree (not committed yet): `waitlist/src/page.html`,
`waitlist/src/app-ui.json`, the built `waitlist/app/index.html`, and the new
`waitlist/scripts/app-ui/capture-live.mjs`. `app/.env.local` (git-ignored) holds a working OpenAI key.

## Goal

The landing page's video section (just under the hero) is a short, Apple-style product film that shows
Duet **as it really works**, with movement. The first version (2026-10-27) was made from reading the
code and was "close but not real". This version was made after running the app on Sintel and watching
each feature. It has two acts: the strip on a scene, then the app (Home), joined by Apple-style
transitions (a title that comes into focus word by word, an iris into Home, passing through one shot
into the next, a dissolve through focus, a slow push-in).

## The film (`waitlist/src/page.html`, built into `waitlist/app/index.html`)

- **Where:** the `<section class="sec video">` markup after the hero; CSS under the comment "The film:";
  script in `var film = (function () { … })()` inside the main page script; the page's Duet hooks
  (`film.hooks`: mood, gesture, speak, look, track) in the Duet part of the script.
- **How it's made:** a stage of 1120 × 630 points scaled to the frame in `fit()`. On it:
  - A desktop (`.f-desk`), and the camera (`.cam`): Sintel's video (`.f-screen`) with a browser title bar
    (`.f-chrome`, shown only when it's a window) and the strip on it (`.f-strip`). The camera is at full
    frame, pushed in on the strip (`is-near`), a window on the desktop (`is-desk`), or out of focus behind
    a title (`is-title`).
  - The strip's states are app pieces of their own, one shown at a time (`show()`): `dock-card` (at rest,
    with a word's card), `dock-talk` (talking), `dock-glow`, `dock-ask`, `dock-done` (a checkpoint).
  - The side panel (`panel`), a window at the screen's right edge.
  - The second act: titles (`.f-title`, `title()`); Home (`.f-app`, `is-app`): `home-bar`, and pages:
    the hub (`tile-today`, `tile-watching`, `tile-words`; `zoomInto()` moves the camera into a tile),
    Today's session (`card-front` / `card-back`, `is-session`), Talk (`talk`, `is-talkpage`, turns shown
    by `turn()`); the languages (`.f-langs`, `lang()`).
  - The page's Duet is the one Duet: dozing in the strip's seat, up in the talk bubble, in the side
    panel's bar, in Home's bar, at the head of Home's Talk, above a title or the closing line (`place()`). Where it sits, that piece's own face
    is hidden (`:host(.f-seated)`). While the camera moves it follows its spot closely (`track` hook).
  - Captured pieces are retold for this scene at start-up (the word card says *trae*, the checkpoint
    asks about *Estoy buscando a alguien*, the flashcard is *traer*, Watching shows Sintel only (the
    other video's thumbnail isn't on the site), Sintel's words are among those met lately). What the
    session changes (streak 12 → 13, due 14 → 13, Known 88 → 89) is set back each loop.
- **The lines are real:** Sintel's Spanish lines as Duet mixed them at levels 3, 4 and 5 in the running
  app (`TRAE`, `BUSCANDO`, …). Colours are set per word (rungs), as a learner with some progress sees
  them; a fresh install shows every new word in one colour.
- **Timeline** (`T`, ms, loops at `LOOP = 54900`):
  - 0–4 s "A little Spanish in everything you watch.": *Gracias.* → *Entonces…* → *What trae you to the
    tierra of the guardianes?*, each rising in as the last fades, the strip gliding to its size.
  - 4–9.3 s "Swipe for more Spanish. Or less.": push in; hover brings up the actions row; two touches
    swipe across the strip; the level circle is tugged (stretch, squash, spring back) 3 → 4 → 5 → 4 → 3
    and the line changes with it.
  - 9.3–11.8 s "Point at any word.": the card for *trae* (action · Heard · brings).
  - 11.8–15.2 s "Ask what a line really means.": click Explain line; the video becomes a browser window
    and the side panel slides in at the screen's edge with Duet's real explanation of the line (*traer*).
  - 15.9–21.7 s "Talk it through, out loud.": click Duet's seat; Duet lifts out into the bubble above
    the strip ("Listening…"), hears you say *¿Qué te trae a la tierra de los guardianes?* and answers
    "¡Muy bien! Roll the r in “tierra”." (mouth moving); the seat's back arrow brings it down again.
  - 22.2–27.7 s "A quick question when a scene ends.": *Estoy buscando someone.*; the strip glows; click;
    the question grows out of it; the answer is typed; Check; "Yes! … You got it."; it folds away.
  - 28.1–31.1 s title: the scene falls back out of focus; "When the episode ends, / *Duet keeps going.*"
    comes in word by word.
  - 31.1–34.3 s "Every show you watch. Every word you meet.": Home opens out of the title like an iris,
    its tiles rising in one by one; the pointer rests on Sintel in Watching.
  - 34.3–37.9 s "Five minutes a day, with the words you heard.": Start passes through the hub into the
    session's card for *traer*; Show the answer flips it; Got it; the streak goes to 13 days.
  - 37.9–41.3 s "Watch each word go from heard to yours.": back to the hub and on into Your words; 13 due,
    Known 89, *traer* glints.
  - 41.9–47.7 s "Keep talking it over with Duet.": Duet in Home's bar opens Talk (a dissolve through
    focus); voice notes and Duet's answers arrive one by one, Duet speaking, the camera drifting in.
  - 47.7–51.2 s Home closes back into the dark; Español → 日本語 → 한국어, "Spanish, Japanese and Korean."
  - 51.2–54.9 s the closing line over the scene again, Duet above it; fade to black; loop.
- **Behaviour:** plays only while ≥ 35% on screen and not paused; with reduced motion it's one still
  frame (the level 3 line).
- **Checked:** recorded at real speed in a headless Edge (a frame every 0.5 s, 1280 wide, dark and
  light; the second act on 2026-10-28 too), and at 390 wide (no sideways scroll), with `landing-film-tools/record.mjs` and
  `sheet.ps1.txt`. The Claude preview pane was hidden, which throttles animation frames, so it's not a
  good place to watch the film; a normal browser tab or the recorder is.

## Pieces captured from the running app

`waitlist/scripts/app-ui/capture-live.mjs <name> <group> <window> <selector>` snapshots one element of
a running Duet (DevTools port 9222) into `app-ui.json` with `snap.js`, adding its rules (both themes)
to its group's stylesheet. Used for `dock-talk` (`overlay index.html .dock`, talking), `panel`
(`panel panel.html main`, on Explain; the "too long ago to hear" note removed and the time set to 1:58
before capturing) and `home-bar` (`home home.html header.workspace-bar`, streak set to 12).
**`capture.mjs` (the design-preview capture) rebuilds `app-ui.json` without these three**: rerun these
captures after it.

## Running the app on this Windows PC

- **Node:** portable Node 22.23.4 at `~/tools/node-v22.23.4-win-x64` (checksum checked against
  nodejs.org). In Git Bash: `export PATH="$HOME/tools/node-v22.23.4-win-x64:$PATH"`.
- `npm ci` is done in `app/` (Electron's binary via `node node_modules/electron/install.js`) and in
  `waitlist/`. `cd waitlist && npm run build:page` after any `page.html` change. `npm run dev` in `app/`
  rewrites `src/shared/languages/registry.ts` and `src/main/progress/frequency-lists.ts` with LF endings
  only; `git checkout` them.
- **Run Duet with its windows inspectable:**
  `cd app && DUET_READER=dev/stand-in-reader.mjs DUET_FRAME="20,480,880,450" DUET_SAY=<file> npm run dev -- --remoteDebuggingPort 9222`,
  then `node docs/handover/landing-film-tools/feed.mjs <file>` feeds Sintel's Spanish subtitles as
  captions. First run shows the welcome (Spanish, placement → Elementary, level 3).
- **Seeing it:** `landing-film-tools/cdp.mjs` (`list`, `shot`, `eval`, `mouse`, `wheel`). Hover on the
  strip is driven by the real pointer (the window is click-through), so CDP mouse moves don't show the
  actions row; `wheel` with a sideways delta does step the level, and `.click()` from `eval` works for
  buttons (talk, Explain).

## Translation

- **Dev build: works.** `app/.env.local` has an OpenAI key that can use gpt-6-luna, gpt-live-1,
  gpt-audio-1.5, gpt-4o-mini-tts and gpt-4o-mini-transcribe (checked 2026-10-28). It was pasted into a
  chat, so replace it once the demo is done.
- **Live server: still broken** as of 2026-10-27: every request returned `502 OpenAI refused the
  server` (the `OPENAI_API_KEY` in Vercel is invalid or revoked). Put a working key in Vercel; the
  server accepts only the models listed in `server/src/rules.js`.

## Next steps

1. Watch the film in a normal browser (`waitlist-static` in `.claude/launch.json` serves `waitlist/app`
   on port 4322), and tune timing and wording to taste.
2. Commit the film on `demo`.
3. Fix the key in Vercel.
