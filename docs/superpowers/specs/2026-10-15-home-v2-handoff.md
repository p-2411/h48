# The home window, v2: tiles, pages and the caption strip

Status: design locked in chat on 2026-10-15. This is the handoff for implementing it in the app.

## Intent

The home window becomes a small tiling workspace in Duet's own look: ink on paper, one coral
accent, colour only where it means something (the words), Duet's face as the one living thing on
screen. Every place (Today, Watching, Your words, Duet) is a tile that can sit beside the others, and
each tile *is* the real page, not a preview. The caption strip over the video is brought into the
same language.

Feel: minimal, neat, human (not "generated"), quick and alive. Motion is fast and physical, like
Hyprland: windows land in about a third of a second; nothing loops except Duet's blink; Duet reacts
when the learner does something and is calm otherwise.

**Sources of truth** (both in this repo):
- `docs/design/home-v2/prototype/`: the prototype's source. Open the `.dc.html` files as text: the
  markup has every size, colour and string, and each file's `<script data-dc-script>` has the
  behaviour (layouts, limits, menus, reactions). `duet.css` has the shared tokens and motion. These
  files need the design tool's runtime to run, so read them, don't run them.
- `docs/design/home-v2/renders/`: static renders of each state. Open them in a browser to see the
  design. They show layout and colour; animations play once on load, and nothing is interactive.

Where this document and the prototype disagree, the prototype wins. Port its numbers and decisions;
do not redesign.

| Render | What it shows |
|---|---|
| `home-hub.html`, `home-hub-night.html` | Nothing open: the hub, by day and at night |
| `home-cards-and-duet.html` | Two open: Your words beside Duet |
| `home-four-tiles.html`, `home-four-tiles-night.html` | All four open |
| `home-settings-panel.html` | The Settings panel slid in from the gear |
| `page-*.html` | Each page full-size (the same body a tile shows) |
| `caption-*.html` | The caption strip: rest, word card, checkpoint, settings |

## Do not port (prototype scaffolding)

- The design-tool **Tweaks**: theme choices other than the locked one (`human`), `iris`,
  `seaglass`, `pastel`, `sticker`, `accent`, `glowband`, `paper`; `nav: rail | shelf`; `start`
  presets; `fun`; `intensity`; `border`; `ground`. Only the locked look ships.
- The canvas boards A–H, G and F rows (explorations), the `Study*`, `Human*`, `Tile*`, `Rail*`
  wrappers.
- Mock data (videos, words, chat lines). Use the real APIs (see *Data*).
- The fixed 1120 × 720 frame and the `AREA_W = 1104` constant used for Duet's grow-from-icon: the app
  measures the real icon and area.
- Inline styles. In the app, use CSS classes and the tokens below.

## 1. The window (`src/main/windows/home.ts`)

- Light by default; dark follows the in-app switch (and Settings → Look: Light, Dark, Match Windows).
  `backgroundColor` = the ground colour of the current theme (`#f2f3f3` / `#121313`) so there is no
  flash.
- The bar is the title bar (48 px, drags the window; buttons in it are `-webkit-app-region: no-drag`).
  - **Windows** (the main target): `titleBarStyle: 'hidden'` with `titleBarOverlay`
    `{ height: 48, color: <ground>, symbolColor: <ink> }`, updated when the theme changes. The
    native min/max/close buttons sit at the far right, so the bar's right group ends about 140 px
    before the edge.
  - **macOS**: `hiddenInset` with the traffic lights centred on the 48 px bar (about `{ x: 18, y: 16 }`);
    the bar's left group starts after them (about 84 px).
- Sizes: default 1040 × 720 (unchanged). Minimum: raise to 820 × 560 (four tiles need it); below
  ~960 px wide, opening a fourth tile replaces one instead (see *Limits*).

## 2. Look

### Colour tokens (`duet.css` → `src/renderer/src/styles/base.css`)
Copy the two sets exactly from `duet.css` (`:root, .theme-light` and `.theme-dark`): `--ground`,
`--card`, `--ink`, `--ink2`, `--sub`, `--faint`, `--on-ink`, `--soft`, `--soft-hover`, `--soft2`,
`--soft3`, `--seg`, `--seg-on`, `--track`, `--switch-off`, `--line`, `--line2`, `--face`, `--eye`,
`--mouth`, the word colours `--w-seen/known/say/use`, `--due`, and the highlighter marks
`--mark-seen/known/say/use`. Put `theme-light` / `theme-dark` on `<html>`.

- The **word (ladder) colours** keep their meaning. At night they are today's bright values
  (`#ffd60a`, `#ff9f0a`, `#4da3ff`, `#32d74b`); by day they are darkened to read on white
  (`#8a6a00`, `#b35c00`, `#1f63b8`, `#1b7a3a`). Map the existing `--k-*` rung variables onto these.
- **One accent:** coral `#e0583a` by day, `#f08a68` at night. Used only for: Duet's open marker and
  "has something to say" dot, the checkpoint stroke on the caption strip.
- **Each place has its own colour**, used only for the brush stroke under its title: Today
  `#eda82c`, Watching `#3fa6dc`, Your words `#3fb579`, Duet `#9478e4`, Settings `#a8adab`.
- **Ground:** neutral white-grey `#f2f3f3` (not warm) by day, `#121313` at night, with a faint
  paper grain (`grain-light.svg`, `grain-dark.svg` in `renders/`, tiled at 160 px).
- **Tiles:** white `--card`, 1 px `rgba(27,32,31,0.09)` hairline, radius 16 px, a 1 px shadow; no
  gradients, no glow, no frosted glass in the home window (glass only where there's video behind:
  the caption strip).

### Type
- Inter for everything; **Instrument Serif** (Google Fonts, bundle it) only for big moments: the
  greeting, a word shown large (today's word, a card's word, a word's detail), "13 days", page ledes
  ("Pick up where you left off.", "Make Duet yours.").
- Labels are sentence case at 13 px / 600. No tracked capitals anywhere.

### The two hand-made marks (the only decoration)
- **Brush stroke** under each place's title: one straight brush-pen stroke, thicker in the middle,
  tapering at both ends, about 6 px tall and exactly the title's width, in the place's colour. Path
  (viewBox `0 0 100 8`, `preserveAspectRatio="none"`) is in any page file, search
  `M1.2 3.9 C 6 2.6`. It wipes in left to right once (`.brush` in `duet.css`).
- **Highlighter** behind a word shown large: a band from 58% to 92% of its height in the word's
  rung mark colour (`--mark-*`), e.g. `linear-gradient(transparent 58%, var(--mark-seen) 58%,
  var(--mark-seen) 92%, transparent 92%)`.

Everything else is plain: no stickers, no doodles, no scribbles, no emoji.

## 3. The bar (48 px)

Three groups (`grid-template-columns: 1fr auto 1fr`). Prototype: `Tiling.dc.html` header, and
`Bar.dc.html` for the version used on full pages.

- **Left: places.** One pill (`--seg` background, 3 px padding): Home, a 1 px divider, then Today,
  Watching, Your words. Icon buttons 36 × 28. An open place is a raised white chip (`--seg-on`,
  1 px shadow, `--ink` icon); closed ones are `--sub`. Click: bring the tile up, or put it away.
  Home puts every tile away.
- **Middle: Duet** (44 × 44 button, face 36 px). It is the chat button.
  - Closed: Duet's face (the icon's shapes: rounded square `--face`, two eyes `--eye` with pupils,
    small smile `--mouth`). Use the new `Mascot` from `2026-10-15-duet-alive-mascot-handoff.md` at
    this size if it is ready; otherwise this simple face.
  - The eyes **follow the pointer anywhere in the window** (pupils up to 2.5 px across, 1.5 px up or
    down, scaled by distance / 160 px, eased over 0.35 s; centre again when the pointer leaves), and
    **blink** every ~6 s. No other idle motion.
  - Hover: lifts 1 px, grows 6%, tilts −2°; the smile widens. Press: shrinks to 0.95.
  - Open: the face becomes a **chat bubble** in the same colours (body `--face`, 1 px `--line2`
    edge, three `--eye` dots that give two small typing bounces), with a 14 × 3 px coral line under
    it. Click to close; it turns back into the face.
  - A small coral dot (8 px, 2 px ring of the ground colour) at its top-right **only when Duet has
    something to say**: on first open (a hello) and after the learner finishes a card. Opening Duet
    reads it.
- **Right: you.** "Spanish ⌄" (the language menu), a 1 px divider, the streak pill (flame + "12
  days" on a faint coral tint; the flame flickers on hover), the light/dark switch, the settings gear.

## 4. Tiling (`src/renderer/src/home/Home.tsx`, replaces the hub's grow-into-page)

Prototype: `Tiling.dc.html`, the `renderVals()` functions (`openTile`, the rects block, `dividers`,
`panes`, `menu`, `settings`).

- **The places:** Today, Watching, Your words, Duet. Up to **four** open at once. The hub shows when
  none is open.
- **Where tiles go** (8 px gap, 8 px margin; ratios are the defaults, all draggable):
  - One: fills the area.
  - Two: side by side 50/50, or stacked top/bottom 50/50 (menu: *Stack top and bottom*).
  - Three, no Duet: a main tile left (56%) and two stacked right (50/50).
  - **Duet is always on the right** in its own column (36% of the width). With Duet: one other tile
    takes the rest; two others sit side by side in the remaining 64% (53/47) or stacked; three others
    are a main tile plus two stacked in the remaining 64%.
  - Duet alone fills the area.
- **Limits:** opening a fifth replaces the last non-Duet tile; opening Duet when three others are
  open puts away the last of them. The main tile never gets replaced by opening another.
- **Resize like Hyprland:** an 8 px handle in every gap (a 4 × 44 px grip shows on hover). Drag to
  resize, live, with no animation while dragging. Where three borders meet there is a round handle
  that moves both lines at once. Double-click any handle to reset it. Ratios are clamped to 22%–78%.
  Keep `DEFAULT_SPLIT` from the prototype: `{ hubCol 0.53, hubRow 0.5, pair 0.5, pairRow 0.5,
  duet 0.64, beside 0.53, besideRow 0.5, main 0.56, stack 0.5, main4 0.5, stack4 0.5 }`.
- **Swap by dragging:** drag a tile by its header (a 6-dot grip shows when two or more are open)
  onto another; they swap. The dragged tile dims to 0.45; the target gets a 2 px dashed outline.
  Duet can't be dragged or dropped on.
- **A tile's header** (44 px): the place's name with its brush stroke; right side, quiet icon
  buttons: *Pop out* (Watching only), *Make main* (when not already), *Close*.
- **Right-click a header** for its menu (Windows users expect it): *Stack top and bottom* / *Put side
  by side* (when two share a space), *Make main*, *Pop out as a small window* / *Put back in the
  tiles* (Watching), a rule, *Close*. Each shows its shortcut.
- **Floating Watching:** a 300 × 206 mini player over the tiles (current video frame, play,
  progress, title, the words met in it). It sits outside the tiling and the four-tile limit; the
  tiles close the gap it leaves. Drag it by its header; let go and it settles into the nearest corner.
- **Keyboard:** Ctrl+0 Home, Ctrl+1–4 the places, Ctrl+W close the focused tile, Ctrl+Enter make
  main, Ctrl+Alt+S stack/side by side, Ctrl+Alt+F float Watching. Esc closes the menu or the Settings
  panel. (Shortcuts must not fire while typing in an input.)
- **Remember the layout** (open tiles, order, ratios, stacked, floating and its corner) across
  launches.
- **Narrow windows:** below ~960 px wide, allow three tiles; below ~820 px, two.

## 5. The hub (nothing open)

Prototype: `Tiling.dc.html`, the `hubStyle` grid. Today on the left (53% wide, full height);
Watching top-right and Your words bottom-right (50/50); both lines draggable, with a corner handle.

- **Today:** "Today" + brush; "Good afternoon." (serif 38 px, time-of-day aware); "Your word for
  today" and the word large in serif (64 px) with its highlighter; its meaning and where it was
  heard ("heard 4 times in *Un día en Madrid*"); the three steps of today's session as rows (1 is
  the current one, ink badge); at the bottom **Start** and "About five minutes".
- **Watching:** two most recent videos as frames with Duet's subtitle line on them, title, "Left off
  at 5:12 · 4 new words".
- **Your words:** "14 ready to review" (serif number), the ladder counts in their colours, and
  "Met lately": recent words in their rung colours.
- Clicking a tile opens that place; the tile grows from its own spot on the hub (see *Motion*).

## 6. The pages (each is one component; the tile and the full page render the same thing)

Prototype bodies: `TodayBody`, `WatchingBody`, `WordsBody`, `DuetBody`, `SettingsBody`. Each sizes
itself to its tile with **container queries** (`.body { container-type: inline-size }`, rules at the
end of `duet.css`). Keep every feature the current pages have; this is a reskin and re-layout, not a
feature cut.

- **Today** (`Today.tsx`, `daily/DailySession.tsx`): three step bars across the top (done = ink,
  current = 40% ink, upcoming = `--track`, with labels), *Skip* at the right. Steps slide in from the
  right. *Say a line back*: the line in serif 42 px with the word highlighted, the Spanish under it,
  a 68 px ink mic button, *Hear it again*. *Review cards*: a card (word in serif with its
  highlighter), *Show answer*, then Again / Hard / Good / Easy with their intervals (Good is the
  ink one). *One challenge*: the task in serif, a sentence field with mic and *Check*. *Done*:
  flame, "13 days" in serif 64 px, "Done for today. See you tomorrow." Narrow tiles (≤560 px): the
  line drops to 30 px, step labels hide.
- **Watching** (`Watching.tsx`): serif lede "Pick up where you left off." (hidden ≤520 px), an
  *All / Still watching* switch, a grid `repeat(auto-fill, minmax(210px, 1fr))` of video cards: 16:9
  frame with the subtitle line and progress, duration, title, "YouTube · left off at 5:12 ·
  yesterday", the words met in it in their colours. Hover lifts 2 px and shows a play button.
- **Your words** (`words/*`): a top row with the ladder counts and **Review 14**; left a 320 px list
  (search, *All / Due / Has a card / Paused*, rows with a rung dot, the word in its colour, its
  meaning, and Due / In 3 days / Paused); right the selected word: rung name, the word in serif 60 px
  with its highlighter, meaning, a five-step ladder bar (New, Heard, Known, Can say, Can use), where
  it was heard (frame + line + *Replay the line*), and the card row (*Practise with Duet*, *Edit
  card*, *Pause*, *Stop colouring this word*). ≤700 px: the list goes above the word (at most 45% of
  the height) and the counts hide.
- **Duet** (`TalkPage.tsx`, `Conversation`): Duet's face (64 px) at the head with "About what you
  watched this week", then the conversation: Duet's bubbles `--soft2`, the learner's ink; voice
  messages as an ink pill with a waveform and duration and the transcript under it; a bordered
  *On your pronunciation* note under Duet's reply when there is one (the word in serif with its
  highlighter, the advice, *Hear Duet say it*); suggested replies as outlined chips; at the bottom
  the field, mic and *Send*. *New conversation* stays.
- **Settings** (`SettingsPage.tsx`, `SettingControls.tsx`): serif lede "Make Duet yours.", then
  sections with sentence-case headings and hairline rows: **Learning** (Language segment; "How much
  Spanish in each line" Auto/1–5 segment with a **live preview** of a subtitle line at that level,
  on a dark strip), **While watching** (the five switches with hints), **Look** (Light / Dark / Match
  Windows; new), **Daily reminder** (time + switch), **Keys** (the two shortcuts as key caps +
  *Change*), **Permissions** (one line + *Check permissions*). ≤560 px: a label sits above its
  control.

## 7. Settings panel

The gear slides Settings in as a panel over the tiles: 500 px wide, the full height of the work area,
8 px from the right edge, 16 px radius, a soft shadow, over a 6% ink scrim. Header: "Settings" with
its brush and a close ×. Click the scrim, the ×, the gear again, or Esc to close. It slides back out
the same way. (The full-page Settings is not needed in the app; the panel is it.)

## 8. Motion (`duet.css`, `Tiling.dc.html`)

Two curves:
- **Windows** (tiles moving, resizing, popping, the Settings panel, Duet growing):
  `cubic-bezier(0.05, 0.9, 0.1, 1.05)` (Hyprland's: fast out, a hair past, settle).
- **Everything else:** `cubic-bezier(0.22, 1, 0.36, 1)` (fast out, no overshoot). Fades:
  `cubic-bezier(0.4, 0, 0.2, 1)`.

| What | How long |
|---|---|
| Tiles move / resize / swap | 0.38 s (no transition while a handle is dragged) |
| A tile opens | pops from 0.93 scale while fading in (0.32 s / 0.18 s); closing reverses (fade 0.2 s) |
| From the hub | the clicked tile grows out of its own spot on the hub; Home shrinks each tile back into its spot as the hub fades in (0.24 s, 0.08 s late) |
| Duet's tile | grows out of the bar icon (scale from 0.06 at the icon's centre, 0.42 s), shrinks back into it; it keeps its real size the whole time (no squashed contents) |
| Content inside a tile | rises 5 px into place 0.06 s after the tile, children 0.025 s apart (0.32 s) |
| Today's steps | slide in 14 px from the right (0.34 s) |
| Settings panel | slides from off the right edge (0.38 s), scrim fades (0.22 s) |
| Brush stroke | wipes in (0.45 s, 0.12 s late) |
| Hovers / presses | 0.15–0.3 s; a press answers immediately (0.08 s) |
| Duet's reactions | open a tile: a small hop; close: a blink; swap: a head tilt; open Duet: eyes widen; finish a card: eyes turn to smiling arcs and the smile widens (0.45–0.5 s each, cleared after 0.6 s; 1.3 s for the smile) |

Rules: nothing loops except the blink; nothing starts invisible in a way that can get stuck (entrance
animations start at 0.25 opacity, not 0); respect Windows "reduce motion" (everything near-instant).
For real smoothness, move and resize tiles with transforms where you can (FLIP), and `contain: layout
paint` on each tile so a resize repaints only that tile.

## 9. The caption strip (`src/renderer/src/overlay/*`)

Prototype: `Caption.dc.html`; renders `caption-*.html`. Keep its structure and behaviour; change:

- **Glass:** Duet's ink, `rgba(17,20,19,0.88)` with a 0.5 px `rgba(238,243,241,0.12)` edge, blur 18 px
  (was macOS cool grey `rgba(30,30,32,0.92)`). Same on the action pills, the word card's shadow,
  and the settings popover. Text `#eef3f1`; English-left words `#b9bfbd`.
- **Keep the status dot exactly as it is** (green / pulsing yellow / red, with glow).
- **Actions row:** Explain, Save, the level, settings, and **Talk** as the white primary pill with
  Duet's two tiny eyes before the word.
- **A word's card** (`LineView.tsx` popup): white card, 14 px radius, opens out of its word with a
  quick pop (0.24 s, window curve). Top line "Verb" and, at the right in its rung colour, "Heard 4
  times" (sentence case, no tracked capitals); the word in Instrument Serif 34 px with its
  highlighter; the meaning; *Save card* (ink), *Hear it*, *Ask Duet*.
- **Checkpoint** (replaces the Apple Intelligence rainbow glow in `Overlay.tsx` / `.strip-glow`
  entirely): Duet's face rises from behind the strip's top-left edge, peeking over it (0.42 s, window
  curve); beside it a small glass bubble asks one thing ("Quick one? Say *madrugar* before the next
  line."); a coral brush stroke draws along the strip's top edge (0.5 s). While a checkpoint is
  showing, the actions row stays closed so nothing crowds Duet. Then the existing checkpoint flow.
- **Settings popover:** same glass; sentence-case labels; the selected segment is a raised chip
  (`#2c2f2f` + 1 px light inset), not `#636366`; switches light-on-dark; an *All settings* link that
  opens the home window's Settings panel.
- Timings to match the home window's (hover row 0.16 s, line opens 0.3 s).

## 10. Data the design needs (check before building; add to main if missing)

- **Today's word** for the hub and Today: a word met recently on a low rung, with how often and where
  it was heard. Likely new in `src/main/daily` / `knowledge`.
- **Words met per video** (Watching cards, the floating player) and **a subtitle line near where the
  learner left off** (drawn on the frame). Fall back to the YouTube thumbnail alone if the line isn't
  available.
- **"Met lately"** words: `knowledge.summary(...).words` already has them.
- **Pronunciation note** in the chat: only if the conversation already produces one; don't invent
  it.
- **Card intervals** on the rating buttons (1 min / 1 day / 3 days / 8 days) from the scheduler.

## 11. Done means

- Every old page feature is reachable; every page works full-size and in a quarter tile.
- One to four tiles in every arrangement; resize, corner handles, drag-swap, float, menu and keyboard
  all work; layout is remembered.
- Light and dark everywhere, including inside every tile, the Settings panel and the caption strip's
  popups; no hard-coded light colours left in page components.
- No tracked capitals, no gradients or glows in the home window, no rainbow glow on the strip.
- Motion matches the table; nothing loops but the blink; reduce-motion respected.
- Existing tests pass (`npm test` in `app/`); typecheck clean.
