# Handover: Explain panel redesign (2026-10-16)

Nothing here is committed. All of it is in the working tree on branch `v2`, alongside other uncommitted work.

## Goal
Make the side panel (Explain and Script, the window that opens when you press Explain on a caption) match the main app's current design. Explain shows the line as a **dictionary entry**, with **what it means in this scene** as the main part. **Duet in the middle of the top bar** opens the chat in the same window, the way Talk opens in Home.

## Done

### 1. The panel uses Home's look, light or dark
- `app/src/renderer/src/panel/main.tsx`: imports `home/workspace.css` and `home/pages.css`.
- `app/src/renderer/src/panel/Panel.tsx`: `<main className="window workspace">`.
- `app/src/renderer/src/panel/useLook.ts` (new): sets `theme-dark` / `theme-light` on `<html>` from the main process and returns `dark`.
- Main process: the panel follows Home's appearance.
  - `src/main/home/index.ts`: adds a `dark` getter, `onLook(listener)` and `emitLook()`. `emitLook()` is called on `home:set-view` and when `nativeTheme` updates.
  - `src/main/panel/index.ts`: adds `setDark()`, the `panel:get-look` handler and the `panel:look` event. The window background is set to `#f2f3f3` (light) or `#121313` (dark).
  - `src/main/index.ts`: `panel.setDark(home.dark); home.onLook(...)`.
  - `src/preload/panel.ts`: `getLook`, `onLook`.
- `app/src/renderer/src/panel/panel.css`: everything after "As the home base is drawn" is the new styling. It's all scoped under `.workspace`, so Home's Talk page is unaffected. It covers the tabs, the Duet button, the entry, Tips, the chat summary, bubbles and Script.

### 2. Explain as a dictionary entry
Same order as the locked card back in `docs/design/cards/README.md`:
1. The line as heard: video and time, Replay, the line in serif italic with the key phrase highlighted, and the English.
2. The headword in syllables, on its word-colour highlighter.
3. IPA, a play button (the system's speech voice) and the part of speech.
4. The meaning in this line (`card.meaning`, serif 23px), plus "Usually: …" when the normal meaning differs.
5. **In this scene** (`explanation.meaning` plus `notice.text`): the main part.
6. Tips, folded: Why here, Another way to say it, Other meanings, Not sure about, Lines before.
7. Save (an ink "primary" button; `SaveCard.tsx`).

A line with no entry skips steps 2–4.

- Data:
  - `src/shared/explain.ts`: new `DictionaryEntry` type and an optional `Explanation.entry` (`headword`, `syllables`, `ipa`, `partOfSpeech`, `usually`, `otherMeanings`).
  - `src/main/ai/explain/prompt.ts`: `entry` added to the instructions and to the zod schema. `EXPLAIN_VERSION` is now 6.
  - `src/main/ai/explain/index.ts`: maps and cleans the entry (trims fields, strips slashes from the IPA, keeps at most 3 other meanings).
- UI: `app/src/renderer/src/explain/ExplainView.tsx` was rewritten. Its pieces are `Heard`, `Headword`, `Tips`, `Entry` and `Summary`.

### 3. Duet in the middle opens the chat, as in Home
- `Panel.tsx`: Duet (`bar-duet`) sits in the middle of a three-column grid header, and is shown once there's an explained line.
  - Pressing it opens the chat; while open, the face swaps to Home's speech-bubble SVG with the coral line under it.
  - Pressing it again closes the chat. Explaining a new line closes it too.
- `ExplainView.tsx`, chat open: Talk's head comes first (`home-talk-head`, Duet's face at `64/420` scale, "About this line"). Then the `Summary` card (press it to go back to the entry), the conversation, and the message bar.
- Closing the chat unmounts `Conversation`, which ends a voice conversation if one is running.

### 4. Suggestion
- `explain/Composer.tsx`: in Explain's chat, "Can I say this?" became **"Try saying it"**. It sends "Let me try saying this line." straight away (new `send: true` pill flag). Talk's suggestions are unchanged.

### Preview
`design-preview/mock-duet.js` has sample Explain data (`panel.getState`, `panel.getLook`, `explain.getState` with an entry and a short chat).
- Run the `home-design` launch config and open `/panel.html`.
- Under 768px wide, the in-app browser falls back to a 980px layout, so preview at about 780px and clamp `.window` to 460px from devtools.

## Still to do
1. **Test in the real app.** Press Explain on a real caption and check what the AI returns for the new `entry` (syllables, IPA, part of speech), across languages. Japanese and Korean headwords probably shouldn't get syllable dots; the prompt may need a rule for that.
2. **Pronunciation audio.** The play button uses `speechSynthesis`, so it's silent where Windows has no voice for the language. Consider Duet's own TTS instead.
3. **Card back.** Saving keeps `entry` inside `card.explanation`, but the card back (`cards/CardView.tsx`, Review) doesn't read it yet. Use it for the syllables, IPA and part of speech.
4. **"Try saying it"** could start voice practice directly (Duet hears you say the line and gives a pronunciation note) instead of sending a text message.
5. **Windows title bar.** The panel is created with `glass: true` (`windows/side.ts`): transparent, `titleBarStyle: 'hiddenInset'`. Check that it has window controls on Windows and that the 40px top padding is right there.
6. **Typecheck.** It currently fails in files that aren't part of this work: `src/main/dictionary/index.ts` and `src/shared/flashcards.ts`, both untracked, probably from another session. Check before committing.
7. **Commit**, when the user says so (they decide when to commit).

## Run
```
cd app
npm.cmd run dev
```
Main-process changes (prompt, panel, home) need a restart; renderer changes reload live.
