# Landing page, Round 3 (handover)

The design record for useduet.io. **The live page now lives in `waitlist/src/page.html`** (built by `npm run build` in `waitlist/` into `waitlist/app/index.html`, sign-ups wired to `/api/join`); the old page is in `waitlist/legacy/` (`npm run dev:legacy`). Change the live page there, not here. Published (private, owner's account): https://claude.ai/artifact/F2CnasGJ6h9QVB7TzjqgqY

## Open it

```bash
node docs/design/landing-round3/tools/build.mjs
```

Then open `docs/design/landing-round3/preview.html` through any local server (the images load by
relative path, e.g. `npx vite docs/design/landing-round3`). Needs `npm install` in `app/` first
(esbuild and the mascot engine come from there).

## Files

| File | What |
|---|---|
| `src.html` | The page source: all markup, CSS and page script. Edit this. |
| `tools/build.mjs` | Bundles the app's mascot engine (`app/src/renderer/src/components/duet`) and inlines it into `src.html` → `duet-landing.html` + `preview.html`. |
| `duet-landing.html` | The built page to publish as an artifact (no `<html>`/`<head>`: the host adds them). |
| `preview.html` | The built page as a full document, for local viewing. |
| `a/` | Real app screens (1.5x captures from the app's design preview, mock data) and the cards from the locked card design, light and dark; the Duet marks and paper grain. |
| `tools/duet-engine-entry.ts` | The bundle entry: exposes `window.DuetEngine.createDuet`. |
| `tools/capture-talk.cjs` | The Talk screen for Practice with Duet (`a/talk-*.png`): a seeded conversation and save-card offer on the design preview (http://localhost:5199). Repo-relative paths; run with `app/node_modules/electron/dist/electron.exe`. |
| `tools/capture-app.cjs`, `tools/capture-cards.cjs` | How the screens in `a/` were made (Electron, off the design preview at http://localhost:5199 and the cards page). They still have the old session's scratch paths hard-coded; fix the paths before reusing. |

## The page, top to bottom

Duolingo/Migaku structure, the user's two sections kept.

1. Sticky translucent nav pill (logo, How it works, Questions, light/dark toggle, Join the waitlist).
2. Hero: Duet on the left; "Watch what you love. *Learn* as you go." + line + waitlist form on the right.
3. Works on: YouTube, Netflix, Crunchyroll, Disney+ (simplified marks).
4. Product shot: the real caption window over the Sintel scene.
5. **Built for what you watch.** Duet speaks the heading from the right. Rows alternate sides: Subtitles at your level (level 2 / level 5 strips), Tap any word (word card, "save it as a flashcard"), One quick question when a scene ends (glowing strip).
6. **Built for you.** Duet speaks it from the left. Rows: Flashcards made from your shows (locked card front and back, Forgot / Got it).
7. **Practice with Duet.** Duet speaks it from the right. One row, Just talk: the real Talk page (Duet at its head, a spoken line, one pronunciation note, the retry, Duet offering to save a card).
8. Closing panel (Duet on top, "Try Duet out now. Your shows are waiting.", the form), then Good to know (FAQ, 5), footer.

## Duet's behaviour (the user's rules; don't change without asking)

- One Duet for the whole page (`#flyer`), the app's new SVG engine, never the old `mascot.css` one.
- On load: asleep, then wakes (engine `wake()`) into idle. Neutral until clicked.
- Eyes follow the pointer only when it is near (`watch: 'near'`), never while speaking (`watch: 'off'`).
- Click in the hero: waves, says "Hi, I'm Duet" in English, Spanish, Japanese, Korean (bubbles come out of it one by one), then scrolls to the first section.
- Scrolling: Duet flies (1.15s, settle curve) to each section heading's spot (`data-spot`), right of the first, left of the second, right of the third; when it lands it speaks the line under the title word by word (mouth moving), with a small voice chip beside it, then nods. The brush underlines are there from the start. Then the closing (waves). Scrolling up, it flies home.
- Only eye-contact moods (idle, listening, speaking, encourage, adoring, correct).

## Brand rules it follows

- Type: Source Serif 4 for headlines and what Duet says (20px+), Inter for UI. Caveat only for "Click me!".
- Word labels and colours: Heard (yellow), Known (orange), You can say it (blue), You can use it (green).
- Cards: the locked design in `docs/design/cards/` (dictionary back, only Forgot / Got it). The app's Review screen still shows Again/Hard/Good/Easy; don't use captures of it.
- Light and dark from the app's home tokens; sea-glass panels (honey, aqua, foam, lilac, peach).

## Known gaps / next steps

- The checkpoint section shows the glowing strip, not the open question card (couldn't capture it).
- Below 860px everything is one centred column (Duet over each heading, visuals capped at 560px, their desktop crops kept); below 520px the type steps down and the forms stack. Checked at 1280, 960, 700 and 375.
- Ported into the live site on 2026-10-16 (see the top of this file).
- Older rounds (A–E) live on the canvas https://claude.ai/artifact/WVDFUVMUydB7vMjWJM3vyP (the newer session can't publish to it).
