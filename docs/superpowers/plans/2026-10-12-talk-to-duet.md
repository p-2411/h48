# Talk to Duet (strip button + home Talk) Implementation Plan

> **For agentic workers:** executed natively in the session that wrote it (superpowers:executing-plans style): TDD per task, tests in app/scripts (`npm test`).

**Goal:** Talk to Duet without opening Explain: a mascot button and shortcut on the strip (voice at once, about the line on screen, small subtitles, "Text chat" hands over to Explain), and a Talk place in the home base (a free conversation in the language, voice or text, saved cards open to Duet).

**Architecture:** The tutor (src/main/tutor) stops being tied to the side panel: whichever window opens a conversation owns it (`TutorWindow`: owns + send), and its context is either a line (`LineContext`) or a free conversation (`FreeContext`). The chat thread logic now inside Explain (send, retry without duplicating, voice turns, replying, errors) moves to `tutor/thread.ts`, used by Explain and by the new Talk (src/main/talk). The renderer's Conversation (explain/) takes a topic (a moment, or a language) and a thread bridge, so Explain and home Talk share it. The strip gets a TalkButton and a TalkBubble running the existing voice hook.

**Spec:** docs/superpowers/specs/2026-10-12-duet-user-flow-design.md ("Related decisions": talk-to-Duet button), plus the user's choices on 2026-10-12: home Talk is a free conversation; the strip starts voice at once.

## Global constraints

- The learner alone confirms saves and ratings, in every window (the tutor's existing gate).
- Pages are untrusted: every new IPC checks its sender and validates its arguments.
- Do not run `prettier --write` on existing files (it reformats whole files); edit in the surrounding style.
- Commit only when the user asks.

## Tasks

1. **Tutor owner.** `Tutor.open(context, window)` where `window: TutorWindow = { owns(sender), send(channel, value) }`; every tutor IPC checks `window.owns`; tutor sends go to `window.send`. Explain passes the panel. Test (test-tutor-actions): a conversation opened by one window refuses another's calls; opening from a second window moves ownership.
2. **Free context.** `TutorContext = LineContext | FreeContext` (`{ kind: 'free'; language; level; conversation?; exploreEnabled? }`) in prompts.ts; `contextText(context)` and `contextLanguage(context)`; text and voice instructions say "the line in the context" only for a line. Test (smoke-tutor): the free context's text names the language and level and no selected line; instructions for free don't mention the line.
3. **Thread.** `ChatThread` (tutor/thread.ts): `ask(message)` (retry of the same failed message doesn't add it twice), `addVoiceTurns(turns)` (validated, bounded), state `{ chat, replying, chatError }`, a change callback. Explain uses it (behaviour unchanged). Test (new scripts/test-talk.mjs): retry, voice-turn validation, a reply for an older thread is dropped.
4. **Talk (main).** src/main/talk: `talk:open` (home only: starts a free conversation in the current language and level), `talk:get-state`, `talk:ask`, `talk:voice-turns`, `talk:state` ← sent to the home page. Test: home-only, state flows, ask goes to the tutor with the free context.
5. **Strip talk (main).** `duet:talk` (strip): opens the tutor on the line on screen, owned by the strip; `duet:talk-to-text` (turns): opens Explain on that line and adds the turns; a second global shortcut (setting `talkShortcut`, default `Alt+Shift+T`) tells the strip to start. Test: talk-to-text adds the turns to Explain's thread.
6. **Renderer.** Conversation takes `topic` (`{ language; moment? }`) and `thread` (ask/voiceTurns bridge); `useLiveTutor` takes the language (and the moment when there is one). Home: a Talk place (sidebar) with the shared Conversation in the dock layout. Strip: TalkButton (mascot outline icon, left of the subtitle box) and TalkBubble (small mascot, subtitles of the last turns, Text chat, End). Settings: the talk keys.
7. **Check.** Typecheck, lint, all suites, build; in the app: strip button → voice starts (status), subtitles, Text chat opens Explain with the turns; home Talk sends a text message and gets a reply; restore the learner's database afterwards.
