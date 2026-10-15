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
Electron app itself) the first time: System Settings › Privacy & Security › Accessibility. Windows
needs no permission. Then open a YouTube or Netflix video in Chrome, Arc, Edge or Brave. The strip
sits on the video; Option+Shift+D (Alt+Shift+D on Windows) shows or hides it by default, and
Settings in the home base changes the keys. The home base opens at launch and from the Dock; the
menu bar (or system tray) icon has the rest.

Checks before you push: `npm run typecheck`, `npm run lint` and `npm test` (every `test:*` suite in
`package.json`, the knowledge ladder's included; `npm run test:native-reader` checks the Windows
reader on Windows).

### Working without a browser

`DUET_READER=dev/stand-in-reader.mjs npm run dev` replaces the caption reader with a script that
plays a YouTube video's part (Sintel, from 1:45). `DUET_FRAME="x,y,width,height"` says where that
video is on screen, and `DUET_SAY=<file>` passes on each JSON line written to the file as if the
reader said it (a new frame, a new video). Development only.

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

1. **Caption reader** (`native/macos/CaptionReader.swift` and
   `native/windows/CaptionReader.cs`, built to `resources/bin/`) watches the browser through each
   OS accessibility layer and prints the same JSON lines: which page is open, the caption text on
   screen, and the player's time and play state. It also takes `pause`/`play`/`seek` on stdin and
   drives the player's own controls. `npm run build:native` builds the reader for the current OS.
2. **Watcher** (`src/main/watcher.ts`) keeps one **LineSession** per video and language. The page's
   **source** (`src/main/sources/`) says which video it is and whether the site offers a transcript:
   YouTube does, so captions don't need to be on; Netflix doesn't, so lines come from the screen.
3. **LineSession** (`session.ts`) sends lines to the line model in chunks that grow (3, 6, 12) from
   the line on screen, with every earlier line as context, so lines are ready before they're spoken.
4. **Line model** (`src/main/ai/lines/`) returns the translation plus matching phrases; `align.ts`
   turns those into word tokens, each with its job and its dictionary form. `src/shared/levels.ts`
   builds the mixed line from them; each word's colour is its rung on the knowledge ladder.
5. **Player** (`player.ts`) turns the reader's whole seconds into a smooth position (`clock.ts`) and
   owns pausing: features _hold_ and _release_ the video, never press play/pause themselves.

## Where things live

| Path                                   | What                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/main/index.ts`                    | Builds the pieces and connects them. Keep it short.                                                                                  |
| `src/main/captions.ts`                 | Runs the caption reader for this OS; turns its output into events.                                                                   |
| `src/main/watcher.ts`, `session.ts`    | Video → lines → processed lines.                                                                                                     |
| `src/main/sources/`                    | One file per video site (`youtube.ts`, `netflix.ts`) behind the `Source` interface.                                                  |
| `src/main/store/db.ts`                 | The local SQLite database (settings, cards, reviews, the watch log, the knowledge ladder) and its migrations.                        |
| `src/main/explain/`                    | Explain that: the side panel's Explain tab and its request.                                                                          |
| `src/main/panel/`                      | The side panel: Script and Explain tabs.                                                                                             |
| `src/main/home/`                       | The home base window: Today, Talk, Watching, Words and cards (with Review), and Settings.                                            |
| `src/main/knowledge/`                  | The knowledge ladder: each word met and what the learner did with it; its rung (`src/shared/knowledge.ts`) colours it and picks practice. |
| `src/main/watchlog/`                   | What was watched with Duet (videos, lines met, words, study days), kept locally, and the streak.                                     |
| `src/main/daily/`                      | The daily session (`plan.ts`) and the daily reminder (`reminder.ts`).                                                                |
| `src/main/checkpoints/`                | When a checkpoint is offered (`triggers.ts`), where scenes end (`scenes.ts`), and the checkpoint itself.                             |
| `src/main/challenges/`                 | The challenges the daily session and checkpoints share: picking them, recall, the quiz, a round and its IPC.                         |
| `src/main/placement.ts`                | Keeps the strip on the video (from the reader's frame), until the learner drags it; the next video snaps it back.                    |
| `src/main/detect.ts`, `spoken.ts`      | Which language a caption line is in, and once per video which language is spoken.                                                    |
| `src/main/welcome.ts`, `shortcut.ts`   | The first-run window, and the show/hide keys.                                                                                        |
| `src/main/demo.ts`                     | Demo fixtures for the tutor (`DUET_DEMO_FIXTURES=1`).                                                                                |
| `src/shared/languages/`                | Every language Duet teaches, one module each (`module.ts` is the shape, `index.ts` the list).                                        |
| `src/main/cards/`                      | Cards: `store.ts` (collection), `scheduler.ts` (ts-fsrs), `review.ts` (queue, rating, undo), `index.ts` (IPC; My cards is a place in the home base). |
| `src/main/replay.ts`                   | Going back to a moment: seek the open video, or open it at that point.                                                               |
| `src/main/audio.ts`, `listen.ts`       | The audio reader (last minute of the browser's sound) and hearing one line for Explain.                                              |
| `native/macos/AudioReader/`            | The audio reader: a Core Audio process tap on the browser, with its own Info.plist and permission.                                   |
| `native/windows/CaptionReader.cs`      | The Windows UI Automation reader for Chrome, Edge, Brave and Arc.                                                                    |
| `src/main/player.ts`, `clock.ts`       | Video position and the play/pause holds.                                                                                             |
| `src/main/wait.ts`                     | "Wait": holds the video while the line on screen is still translating.                                                               |
| `src/main/settings.ts`                 | The learner's settings, saved in the database; listen for `change`.                                                                  |
| `src/main/tutor/`                      | Voice tutor, main-process side: the live session, its prompts and its tools (cards, and practice words: `practice.ts`).              |
| `src/main/ai/`                         | Text models: `structured.ts` is what every provider does (`providers/`); tasks (`lines/`, `explain/`) are written once on top of it. |
| `src/main/ai/voice/`                   | Voice models (speech↔text), same pattern.                                                                                            |
| `src/main/windows/`, `ipc/`, `tray.ts` | Windows, each window's IPC, the menu bar icon.                                                                                       |
| `src/preload/`                         | `window.duet`: one file per window or feature (`overlay`, `panel`, `explain`, `cards`, `tutor`, `welcome`, `home`, `daily`, `checkpoint`, `knowledge`). |
| `src/renderer/`                        | One HTML page per window; `src/overlay/`, `src/panel/`, `src/explain/` (with `voice/`), `src/cards/`, `src/home/`, `src/welcome/`, `components/` (with `challenges/`). |
| `src/shared/`                          | Types used by both sides: lines, settings, levels, `moment.ts`, `explain.ts`, `cards.ts`, `home.ts`, `daily.ts`, `checkpoints.ts`, `knowledge.ts`. |

## Moments

A **moment** (`src/shared/moment.ts`) is a line the learner picked, frozen with the lines just
before it (2 minutes, at most 4,000 characters, never later lines) and where it came from (site,
video id, title, position).
Everything that helps with a line (Explain, the tutor, cards) starts from one, so they all see the
same context. `watcher.moment(lineId?)` takes one.

## Adding things

- **A language:** a file in `src/shared/languages/` that fills in `LanguageModule` (`module.ts`): its
  name, how it is recognised, its romanisation if it isn't written in Latin letters, the welcome
  sample, its note for the line prompt, and its own sections of the tutor's prompts. Add it to
  `LANGUAGE_MODULES` in `index.ts`; the settings, prompts, detection and card schema read the list.
  `npm test` checks every language's prompts and detection.
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
  captions, play state, seek bar and play button, by class or by label) and, for placement, the
  element that frames the video.

## Explain that and cards

- **Explain** (on the strip's hover row, on a line in Script, or "Explain this line" in the menu bar)
  opens the side panel's Explain tab on the line: what it means here and how it comes across, with
  more under "More", Replay and Save, then the conversation about the line (below).
- **Save** fills an editable card from the explanation; the same line, target and type is
  caught as a duplicate. **My cards** (in the home base) lists, searches, edits, pauses, deletes (with undo),
  backs up and restores cards, and runs **review** with FSRS (`ts-fsrs` 5.4.2): due learning cards,
  then due reviews, then new cards within the daily allowance (10, study day from 04:00). A rating
  is one transaction with the scheduler state before and after; undo restores the state before.
- Cards live in `duet.db` in the app's data folder, on this computer only.

## The home base, the daily session and checkpoints

- The **home base** is a normal window with a Dock icon: Today (the streak and today's session),
  Watching (videos watched with Duet, reopened where the learner left off), My cards (with Review)
  and Settings. The welcome window comes first until the learner has been through it.
- The **knowledge ladder** (`src/main/knowledge/`, rules in `src/shared/knowledge.ts`): each word (by
  its dictionary form) is new, seen before, known, sayable or usable, or ignored, worked out each
  time from what the learner did (recalls, lines said, sentences of their own) and its card's FSRS
  memory, so forgetting moves it back down. Its rung is its colour: new white, seen before yellow,
  known orange, sayable blue, usable green, ignored grey. The Auto level (A, the default) swaps in
  level 1's words and every word known.
- The **watch log** (`src/main/watchlog/`) keeps, on this computer only, the videos watched, the lines
  met in the last 30 videos, the words the learner hovered, saved, explained or missed, and each study
  day. A day is kept by finishing the daily session, finishing a checkpoint, or watching 10 minutes;
  each Monday-to-Sunday week forgives two missed days (freezes).
- The **daily session** (Today › Start): the cards due (at most 12, in the scheduler's order), then a
  line from the last video that Duet says and the learner says back (`DUET_TTS_MODEL`,
  `DUET_COACH_MODEL`), then one challenge, by the words' rungs: a line whose words are all sayable is
  said back and then used in a sentence of the learner's own (judged word by word); else a word only
  met is recalled, or the learner says what a line meant. Lines whose words are all usable are left
  out. Today is kept only when something was done. An optional reminder (Settings) comes when today isn't kept.
- **Checkpoints** (Settings; on by themselves after the third video, unless the learner chose) glow
  on the strip at a pause the learner makes or where a scene or conversation ends, judged from the
  dialogue by `gpt-6-luna`. An offer stands 10 s; at most one every 5 minutes, or every 10 after one
  is left alone. Clicking it holds the video for one challenge from the last few minutes. A word
  missed, here or in the daily session, becomes a card.

## Hearing the video

Explain listens to how a line was said, so its explanation of how the line comes across can draw on
the delivery, not only the words.

- The **audio reader** (`native/macos/AudioReader`, macOS 14.2+) taps only the browser's sound with a
  Core Audio process tap while a video is being watched, and keeps the last minute in memory. Nothing
  is written to disk; a clip leaves it only when Explain asks for one line.
- It needs **System Audio Recording**. It runs as its own responsible process with an Info.plist built
  into the binary (`io.useduet.audio-reader`), so the prompt and the setting belong to it. Duet asks on
  the first Explain, not at launch. Without permission macOS hands over silence, which Duet treats as
  "couldn't hear". Ad-hoc builds change identity on every rebuild, so macOS may ask again.
- `player.ts` records video time against real time, so a transcript line's start and end can be found
  in the recording (`playedAt`). Lines read from the screen use the moment they appeared.
- The **listener** (`ai/voice`, `gpt-audio-1.5` by default, `DUET_LISTEN_MODEL`) gets the sound only,
  never the subtitle: given the text, it reported English speech as Spanish and stress on words nobody
  said. It answers through a forced tool call (the audio models don't take a response schema), with
  the language it actually heard. On a subtitled or dubbed video Explain then says the delivery is the
  original actor's.
- Windows needs its own audio reader (WASAPI process loopback); until then Explain works from the words.

## The conversation about a line (text or voice)

- Explain is the way in, from the strip, a line in Script, "Explain this line" in the menu bar, or
  "Practise" on a card. Under the explanation is one conversation with Duet, typed by default; the mic
  switches it to voice, and ending voice brings its turns back into the thread, so either mode picks
  up where the other left off (`src/renderer/src/explain/Conversation.tsx`, `src/main/tutor/`).
- Both modes get the same line context (`tutor/prompts.ts` `lineContext`): the line and the lines
  before it, how it was said in the video (when Duet heard it), the explanation, and the conversation
  so far. Voice also hears the learner, so it can judge pronunciation and tone. It teaches every
  language in `src/shared/languages/`: the policy is shared, each language brings its own speech and
  correction sections.
- Text replies come from `gpt-6-luna` through the Responses API with the tutor's tools (`tutor/text.ts`).
  Voice uses `gpt-live-1` over WebRTC, delegating reasoning and the same tools to `gpt-6-luna`; the
  renderer owns microphone and playback, and the main process exchanges the SDP offer, so
  `OPENAI_API_KEY` never enters the page. The video waits while voice is live. `gpt-6-luna` also writes
  the Meaning reveal and the romanisation. Override the voice with `DUET_LIVE_VOICE` (it is also the
  voice that says a line to say back) or that model with `DUET_LIVE_BACKEND_MODEL` in `.env.local`.
  Saying a line back uses `DUET_TTS_MODEL` (default `gpt-4o-mini-tts`) to say it and
  `DUET_COACH_MODEL` (default `gpt-audio-1.5`) to hear the learner.
- Duet uses the same `duet.db`, card collection and FSRS scheduler as My cards. Saves and reviews are
  previewed first and committed only by the learner: a click, or a reply after the preview.
- `DUET_DEMO_FIXTURES=1` (demos only, never in a packaged build, `main/demo.ts`) seeds two labelled Japanese cards into an empty
  `duet.db`, opens Explain at launch, and uses a Japanese demo line when no line is on screen.
  Raw audio and full voice transcripts are not stored locally.
- Pronunciation checks are explicit, narrow and qualitative. They do not provide an accent score or
  claim that every sound is correct.

## Conventions

- Comments say _why_, in plain words, at the top of each file and above anything non-obvious.
- New dependencies are pinned to exact versions at least two weeks old.
- Model-facing types live in `src/main/ai`; types the windows render live in `src/shared`.
- Never print or commit keys.
