# Handover: the landing page's product film (2026-10-27)

Branch `demo`. Everything below is committed there, except `app/.env.local` (git-ignored, see
"Translation" for what's in it).

## Goal

The landing page's video section (just under the hero) used to be a still: a Sintel frame with a
frozen copy of the caption strip. The owner wants it to be a short, Apple-style product film that
shows Duet **as it really works**, with movement.

A first version of the film is built and on the page. The owner's verdict: **"close but not real"**.
The film was made from reading the code and the app's captured UI, before the app had been run. The
job now is to run the app, watch how each feature really behaves, and rework the film to match.

## What's built

### The film (`waitlist/src/page.html`, built into `waitlist/app/index.html`)

- **Where:** the `<section class="sec video">`, markup after the hero; CSS under the comment "The
  film:"; script in `var film = (function () { … })()` inside the main page script.
- **How it's made:** a stage of 1120 × 630 points (`.film-stage`) scaled to the frame in `fit()`, so it
  plays like a video at every width. On it:
  - `<video>` of Sintel (`waitlist/app/a/sintel-scene.webm` / `.mp4`, copied from `waitlist/legacy/media`,
    lazy-loaded when first on screen), in `.cam`, which the camera moves.
  - The app's **real UI pieces** from `waitlist/src/app-ui.json`, mounted by the page's existing loop
    (`data-ui="…"` with `data-fit="film"`, so `fit()` leaves them alone and the film sizes them once):
    `dock-card` (strip + actions + word card), `dock-glow`, `dock-done` (checkpoint), `explain`, `talk`,
    `card-front`, `card-back`.
  - A pointer (`#film-cursor`), a line per shot top left (`#kicker`), an end card (`.f-end`), a fade to
    black between loops, and a pause button (`#film-toggle`).
  - Each shadow root gets an extra `<style>` (`INSIDE`) so the card can wait for its cue, words can
    animate, and the strip's own face and Talk's face give way to the page's flying Duet.
- **Timeline** (`T`, ms, loops at `LOOP = 27600`):
  - 0–6.9 s: "Subtitles that meet you where you are." English line; words swap to Spanish one by one
    in their rung's colours; hover shows the actions; level 3 → 5 → 3.
  - 6.9–12.2 s: "Ask about any line, or any word." Pointer to *compró*, its card; clicks Explain line;
    the video shrinks left and the Explain panel slides in.
  - 12.9–16.8 s: "Say it out loud. I'm listening." Home **Talk** window over the dimmed video; a voice
    note, then Duet's reply.
  - 17.3–21 s: "A quick question when a scene ends." Strip glows; click; the checkpoint grows out of it.
  - 21.4–24 s: "Flashcards, made from your shows." *madrugar* card, flips to its back.
  - 24.3–27.6 s: "Watch what you love. *Learn* as you go." with the orange brush; fade; loop.
- **The page's Duet** (the one flyer the page has) plays its part: `film.hooks` sets its mood and
  gestures while it's at the video (`at === 'video'`), and the film moves the `video` anchor each frame
  (`place()`: above the strip, beside the word card, in Talk's face, beside the flashcard, above the end
  line). Its old speech bubble over the video was removed (`LINES.video`).
- **Behaviour:** plays only while ≥ 35% on screen and not paused; with reduced motion it's one still
  frame (level 3 line). The floating email bar now steps aside while the film is on screen (it covered
  the subtitles).
- **Checked** in the browser at 1280 wide (dark) and 390 wide (light): every shot, no sideways scroll,
  no console errors except Vercel analytics' 404 locally. Only checked on a hand-stepped clock (the
  preview pane was in the background), **never watched at real speed**.

### Where the film is wrong (from reading the app's code; confirm by running it)

1. **Lines don't swap word by word.** Each line arrives already translated and the new one rises in as
   the old fades out (`app/src/renderer/src/overlay/Overlay.tsx`, the `AnimatePresence` around
   `LineView`; `fadeUp(4, 0.18)`). The words are mixed in already, coloured by rung.
2. **Explain doesn't shrink the video.** It opens the side panel, a separate window at the screen's
   right edge (`app/src/main/windows/side.ts`, `app/src/main/panel/index.ts`), over or beside the browser.
3. **Talking from the strip isn't the home Talk window.** Pressing the strip's mascot button (or the
   talk keys) lifts Duet out of its seat into a **TalkBubble** just above the subtitles: Duet alone (120
   px, wakes up, mouth follows the voice), small subtitles of what it heard and said, a quiet row (Mute,
   look, Continue in Duet); the seat shows a back arrow (`overlay/TalkBubble.tsx`, `Overlay.tsx`).
   Home Talk is a page in the home window.
4. **Flashcards live in the home window** (Your words › Review), not over the video.
5. **The strip at rest** is only the mixed line and the status dot; Duet dozes in the round seat at its
   left. Hovering shows the actions row above (level circle, Explain, star, replay, settings). A **click**
   opens it to the whole line in Spanish and the English under it. Two fingers sideways step the level;
   the circle is tugged and springs back with the new number (`overlay/LevelSlider.tsx`).
6. Hovering a word shows its card (job, rung, the word, its English, Save / Explain line / Ignore).
7. Checkpoints (glow, click, the question grows up out of the strip) match the app.

## Running the app on this Windows PC

- **Node:** portable Node 22.23.4 at `~/tools/node-v22.23.4-win-x64` (checksum checked against
  nodejs.org). Nothing installed system-wide. In Git Bash:
  `export PATH="$HOME/tools/node-v22.23.4-win-x64:$PATH"`.
- `npm ci` is done in `app/` (Electron's binary needed `node node_modules/electron/install.js` once) and
  in `waitlist/`. So **`cd waitlist && npm run build:page` works now**; use it after any `page.html`
  change. `npm run dev` in `app/` rewrites `src/shared/languages/registry.ts` and
  `src/main/progress/frequency-lists.ts` with LF endings only; `git checkout` them, they don't change.
- **Run Duet with its windows inspectable:**
  `cd app && DUET_READER=dev/stand-in-reader.mjs DUET_FRAME="20,480,880,450" DUET_SAY=<file> npm run dev -- --remoteDebuggingPort 9222`
  - The **stand-in reader** says Sintel is playing on YouTube (from 1:45) without a real browser.
    `app/src/main/captions.ts` now runs a stand-in script on Electron's own Node, because Windows can't
    start a `.mjs` by its shebang (dev only; committed on this branch).
  - Without `DUET_READER`, Duet's real Windows caption reader reads whichever browser window is in
    front (it worked with Sintel open in Chrome), but that takes over the screen.
  - Duet fetches the video's Spanish **transcript** from YouTube. It worked twice (26 lines), then
    YouTube returned no caption tracks for a while (likely rate limiting). Then Duet falls back to
    "Listening to the video". `DUET_SAY=<file>` + `landing-film-tools/feed.mjs <file>` feeds Sintel's
    real Spanish subtitles as on-screen captions instead (the same path Netflix uses).
- **Seeing it:** `landing-film-tools/cdp.mjs` talks to Duet's windows over the DevTools port:
  `node cdp.mjs list`, `shot <url part> out.png`, `eval <url part> "<js>"`, `mouse`, `wheel`. Windows are
  `index.html` (the strip), `home.html`, `panel.html`, `welcome.html`. `screenshot.ps1.txt` captures the
  whole desktop: `SHOT_OUT=<file.png> powershell -NoProfile -Command - < screenshot.ps1.txt`.
- First run shows the welcome; Spanish was chosen.

### Translation: blocked

- **Duet's live server refuses to translate.** Every request returns `502 OpenAI refused the server`,
  which `server/src/proxy.js` sends when OpenAI answers the server's own key with 401/403. So the
  `OPENAI_API_KEY` in Vercel is invalid or revoked (or can't use `gpt-6-luna`). This likely breaks the
  released app for everyone. **Fix the key in Vercel.**
- **Sign-in for dev builds:** the WorkOS client id is not in the repo (only `client_123` in tests);
  it's the GitHub variable `MAIN_VITE_WORKOS_CLIENT_ID`. It was read from the public v1.0.0 release:
  `client_01M507812FZ4BA0TXPEJA6ZBP4` (not a secret). For a dev build to use the server, `app/.env.local`
  needs `DUET_API_URL=https://api.useduet.io/v1` and `DUET_WORKOS_CLIENT_ID=<that id>`, then Sign in
  (the owner signs in; it opens Google via WorkOS).
- **Dev key:** `app/.env.local` currently holds only an `OPENAI_API_KEY`, and **OpenAI rejects that key
  (401 invalid_api_key, checked directly)**. It was pasted into a chat, so treat it as burned. Put a new
  key there (that file is git-ignored; never commit a key). With a key and no `DUET_API_URL`, the dev
  build goes straight to OpenAI and no sign-in is needed.
- No real keys exist in any branch or in history (searched all 21 remote branches; there is no `v2`).

## Next steps

1. Get a working OpenAI key into `app/.env.local` (and Vercel).
2. Run Duet as above and use every feature on Sintel's lines: a line arriving, hovering a word, the
   level swipe, clicking the strip open, Explain (the side window), the talk button (TalkBubble), a
   checkpoint (turn checkpoints on in Settings, or wait for a pause/scene end), and a flashcard in the
   home window. Capture each with `cdp.mjs shot` and the desktop screenshot.
3. Rework the film's shots in `page.html` to match what was seen (the list under "Where the film is
   wrong" is the starting point). Explain and Talk should look like windows on a desktop next to the
   video, not panels inside it.
4. `cd waitlist && npm run build:page`, preview (the `waitlist-static` config in `.claude/launch.json`
   serves `waitlist/app` on port 4322 without Node; with Node on PATH the `waitlist` config works too),
   and watch it at real speed.
