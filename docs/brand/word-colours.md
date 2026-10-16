# Duet: word colours

Set on 2026-10-16.

Every word state has a colour, and none is white or black. The colour is the word's state wherever a word appears: the caption strip, Your words, cards, the hub tiles, Settings' preview.

| State (code) | On screen | On dark (strip, dark mode) | On light | Why this colour |
|---|---|---|---|---|
| unknown | New to you | `#b9a6f7` lilac | `#6b4fc8` | Duet's own colour (the Duet tile). New words are where Duet steps in to explain. |
| encountered | Heard | `#ffd60a` yellow | `#8a6a00` | The ladder starts warm: a word you've met is warming up. |
| known | Known | `#ff9f0a` orange | `#b35c00` | Warmer: the meaning has sunk in. |
| speakable | You can say it | `#4da3ff` blue | `#1f63b8` | The ladder cools once a word is yours to produce. |
| usable | You can use it | `#32d74b` green | `#1b7a3a` | Settled: you use it in your own sentences. |
| ignored | Ignored | `#a8998a` stone | `#7a6c5e` | Put aside, still there: a quiet warm grey, distinct from every ladder colour. |

Behind a large word (headwords, highlighted words) each state also has a highlighter: `--mark-new`, `--mark-seen`, `--mark-known`, `--mark-say`, `--mark-use` in `home-tokens.css`.

Not a word state, so not coloured: English words in a mixed line (plain grey in the strip) and "glue" (punctuation and other bits with no word behind them, `data-k="glue"`).

## Where the values live

- `app/src/renderer/src/styles/base.css`: `--k-*`, the dark values every window uses.
- `app/src/renderer/src/styles/home-tokens.css`: `--w-*` and `--mark-*`, light and dark, for the home window; `workspace.css` maps `--k-*` to them.
- `app/src/renderer/src/welcome/welcome.css` and the Settings preview in `home/pages.css` repeat the dark values, because they always sit on dark.

Labels are in `app/src/shared/knowledge.ts` (`STATE_LABELS`).
