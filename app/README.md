# Duet app

A desktop overlay that helps English speakers learn Spanish, Japanese or Korean from the videos
they already watch. It reads the video's lines, translates each one in context, and shows a mixed
line (some words swapped into the language you're learning) over the video. Electron, React,
TypeScript, plus a small native caption reader per OS.

## Run it

```bash
npm install
npm run dev
```

Put your keys in `app/.env.local` (git-ignored, never commit it):

```bash
OPENAI_API_KEY=sk-...
```

On macOS, grant **Accessibility** to the app that runs `npm run dev` (Terminal, your editor, or the
Electron app itself) the first time: System Settings › Privacy & Security › Accessibility. Then
open a YouTube video in Chrome, Arc, Edge or Brave. Option+Shift+D shows or hides the overlay; the
menu bar icon has the rest.

Checks before you push: `npm run typecheck` and `npm run lint`. There is no test runner yet.

## How a line gets on screen

```
browser ──(accessibility)──▶ caption reader ──JSON lines──▶ CaptionSource
                                                              │ which video, captions, position
                                     ┌────────────────────────┴───────────────┐
                                     ▼                                        ▼
                         Watcher: transcript (YouTube) or            Player: clock + holds
                         captions on screen → LineSession             (the only thing that
                         → line model in chunks → lines                pauses/plays the video)
                                     │
                         ipc/overlay.ts ──▶ overlay window (React)
```

1. **Caption reader** (`native/macos/CaptionReader.swift`, built to `resources/bin/`) watches the
   browser through the OS accessibility layer and prints JSON lines: which page is open, the
   caption text on screen, and the player's time and play state. It also takes `pause`/`play` on
   stdin and presses the player's own button. Rebuild after changing it:
   `swiftc -O native/macos/CaptionReader.swift -o resources/bin/caption-reader-macos`.
2. **Watcher** (`src/main/watcher.ts`) keeps one **LineSession** per video and language. The page's
   **source** (`src/main/sources/`) says which video it is and whether the site offers a transcript:
   YouTube does, so captions don't need to be on; Netflix doesn't, so lines come from the screen.
3. **LineSession** (`session.ts`) sends lines to the line model in chunks that grow (3, 6, 12) from
   the line on screen, with every earlier line as context, so lines are ready before they're spoken.
4. **Line model** (`src/main/ai/lines/`) returns the translation plus matching phrases; `align.ts`
   turns those into coloured word tokens. `src/shared/levels.ts` builds the mixed line from them.
5. **Player** (`player.ts`) turns the reader's whole seconds into a smooth position (`clock.ts`) and
   owns pausing: features *hold* and *release* the video, never press play/pause themselves.

## Where things live

| Path | What |
| --- | --- |
| `src/main/index.ts` | Builds the pieces and connects them. Keep it short. |
| `src/main/captions.ts` | Runs the caption reader for this OS; turns its output into events. |
| `src/main/watcher.ts`, `session.ts` | Video → lines → processed lines. |
| `src/main/sources/` | One file per video site (`youtube.ts`, `netflix.ts`) behind the `Source` interface. |
| `src/main/store/db.ts` | The local SQLite database (settings, cards, reviews) and its migrations. |
| `src/main/explain/` | Explain that: the window and its request. |
| `src/main/cards/` | Cards: `store.ts` (collection), `scheduler.ts` (ts-fsrs), `review.ts` (queue, rating, undo), `index.ts` (IPC, My cards window). |
| `src/main/replay.ts` | Going back to a moment: seek the open video, or open it at that point. |
| `src/main/player.ts`, `clock.ts` | Video position and the play/pause holds. |
| `src/main/wait.ts` | "Wait": holds the video while the line on screen is still translating. |
| `src/main/settings.ts` | The learner's settings, saved in the database; listen for `change`. |
| `src/main/tutor/` | Voice tutor, main-process side. |
| `src/main/ai/` | Text models: `structured.ts` is what every provider does (`providers/`); tasks (`lines/`, `explain/`) are written once on top of it. |
| `src/main/ai/voice/` | Voice models (speech↔text), same pattern. |
| `src/main/windows/`, `ipc/`, `tray.ts` | Windows, each window's IPC, the menu bar icon. |
| `src/preload/` | `window.duet`: one file per window or feature (`overlay`, `tutor`, `explain`, `cards`). |
| `src/renderer/` | One HTML page per window; `src/overlay/`, `src/tutor/`, `src/explain/`, `src/cards/`, shared `components/` and `styles/`. |
| `src/shared/` | Types used by both sides: lines, settings, levels, `moment.ts`, `explain.ts`, `cards.ts`. |

## Moments

A **moment** (`src/shared/moment.ts`) is a line the learner picked, frozen with the lines just
before it (20 seconds, at most 1,500 characters, never later lines) and where it came from.
Everything that helps with a line (the tutor, pronunciation, later Explain that and cards) starts
from one, so they all see the same context. `watcher.moment(lineId?)` takes one.

## Adding things

- **An AI provider:** implement `StructuredModel` (`ai/structured.ts`) in one new file in
  `ai/providers/` and add a case to its `index.ts`; every task then works on it. For voice, the same
  in `ai/voice/`. Throw `ModelError` for failures.
- **An AI task:** a folder in `ai/` with its instructions and output schema (zod), built on
  `StructuredModel.complete`, like `explain/`. Pick `pace: 'quick'` only when someone is watching
  and waiting.
- **A database change:** add a migration at the end of `MIGRATIONS` in `store/db.ts`; never edit one
  that has shipped.
- **A window:** `src/renderer/<name>.html` + `src/renderer/src/<name>/`, add it to `rollupOptions.input`
  in `electron.vite.config.ts` and to `Page` in `windows/load.ts`, a creator in `src/main/windows/`,
  its IPC on `<name>:*` channels, and its bridge in `src/preload/<name>.ts`.
- **Something that pauses the video:** add a `Holder` in `player.ts` and use `hold`/`release`.
  Listen for `overridden`: the viewer pressed play, so stop waiting.
- **A site:** one file in `src/main/sources/` implementing `Source` (which addresses it owns, the
  video id, an optional transcript, a link to a point in the video, what its player allows), listed
  in `sources/index.ts`, plus its entry in the reader's `sites` table (which page elements hold the
  captions, play state, seek bar and play button). Netflix reads captions only so far: its player
  controls need its elements found in the reader first.

## Explain that and cards

- **Explain** (overlay bar button, or "Explain this line" in the menu bar) opens a side window on the
  line on screen: meaning here, what to notice, why, an alternative and any limitation, with Replay
  and Save card. The view is one component (`src/renderer/src/explain/ExplainView.tsx`) so it can move
  into the tutor's window later.
- **Save card** fills an editable card from the explanation; the same line, target and type is
  caught as a duplicate. **My cards** (menu bar) lists, searches, edits, pauses, deletes (with undo),
  backs up and restores cards, and runs **review** with FSRS (`ts-fsrs` 5.4.2): due learning cards,
  then due reviews, then new cards within the daily allowance (10, study day from 04:00). A rating
  is one transaction with the scheduler state before and after; undo restores the state before.
- Cards live in `duet.db` in the app's data folder, on this computer only.

## Voice tutor: starting points

- The window exists (`windows/tutor.ts`, `src/renderer/src/tutor/`) and opens on a moment from the
  menu bar ("Talk about this line") or `window.duet.openTutor()` in the overlay. It holds the video
  while open (`tutor/index.ts`).
- Speech to text and text to speech work through `createVoiceModels()` in `ai/voice/` (OpenAI
  `gpt-4o-transcribe` and `gpt-4o-mini-tts` by default; override with `DUET_STT_MODEL`,
  `DUET_TTS_MODEL`, `DUET_TTS_VOICE`). Measured: a short sentence took ~6.5 s to synthesise whole
  and ~2.4 s to transcribe, so stream speech for conversation. The realtime models
  (`gpt-realtime-*`) are an option too.
- Run model calls in the main process (keys stay there), pass audio over `tutor:*` IPC. Record in
  the page with `getUserMedia`; macOS asks for the microphone on first use. Ask only when the learner
  first presses record.
- Pronunciation: the spec says scored feedback can't ship until experts have checked its accuracy
  per sound property. Start with record, replay and compare with a reference; label generated
  audio as generated.

## Conventions

- Comments say *why*, in plain words, at the top of each file and above anything non-obvious.
- Dependencies are pinned to exact versions at least two weeks old.
- Model-facing types live in `src/main/ai`; types the windows render live in `src/shared`.
- Never print or commit keys.
