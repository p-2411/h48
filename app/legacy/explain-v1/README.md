# Legacy: Explain panel, first design

A snapshot of the Explain side panel as it was before the redesign of 2026-10-16
(`docs/handover/explain-redesign.md`), taken from commit `ef19b0d` on `v2`.

Kept for reference only. It is outside `src/`, so it isn't built or typechecked, and its relative
imports point at where the files used to live (`app/src/renderer/src/explain/`, `.../panel/`).

| File | What it was |
| --- | --- |
| `explain/ExplainView.tsx` | Explain view: the line, the explanation, chat below |
| `explain/Conversation.tsx` | The chat, with the old CSS mascot (`components/Mascot`) |
| `explain/Composer.tsx` | Message bar; the "Can I say this?" suggestion |
| `explain/SaveCard.tsx` | Save button (plain `btn`) |
| `panel/Panel.tsx` | Panel window: Explain / Script tabs, no Duet button |
| `panel/main.tsx` | Panel entry, without Home's workspace styles |
| `panel/panel.css` | Panel styling before the Home look |

The rest of the old styling is in `src/renderer/src/explain/explain.css`, which the redesign didn't change.

To bring a file back: `git show ef19b0d:app/src/renderer/src/<path>` or copy it from here.
