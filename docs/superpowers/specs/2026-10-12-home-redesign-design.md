# The home base, redesigned

Status: agreed in chat on 2026-10-12 (layout, tiles, pages and motion chosen from mockups); the
choices marked **(proposed)** were made while writing and are for review.

## Intent

The home base looks like a different app from the strip and the side panel: an opaque black window
with a title bar, a plain list for a sidebar, and boxes drawn with thin lines. It should look and
move like the rest of Duet: dark see-through glass, 18 px rounded panels, white pill buttons, words
glowing in their ladder colours, and the mascot.

It is also rethought as a **hub**: one screen that shows a little of everything (today's session and
streak, the videos to go back to, the learner's words, Talk to Duet). Each part is a tile; a tile
grows into its full page and shrinks back into its tile.

Success:
- Put the home window beside the side panel: same material, same type, same controls, same corners.
- Everything the old home base could do, the new one can, from at most one click on the hub.
- No page shows the tiles through it while it opens or closes.
- First run (nothing watched, no words, no streak) shows what each tile is for, not an empty box.

Product rules from `2026-10-12-duet-user-flow-design.md` that change here:
- **Progress is no longer the streak only:** the Your words tile shows the ladder counts.
- **Words and Cards become one place** (Your words); Review is opened from it and from Today.

## 1. The window

- macOS window material like the side panel's (`vibrancy: 'sidebar'`, `visualEffectState: 'active'`,
  transparent background) under a dark tint, with the window buttons inset in the content
  (`titleBarStyle: 'hiddenInset'`). On Windows and Linux: the tint over solid `#101013`.
- Default 1040 × 720; smallest 760 × 520 (unchanged).
- No sidebar. A top bar (dragging the window) with **Duet**, the language learnt (日本語, Español,
  한국어), and the ⚙ gear at the far end.

## 2. The hub

Four glass tiles in a grid (three columns: 1.2fr 1fr 1fr; two rows):

| Tile | Where | Shows | Grows into |
|---|---|---|---|
| **Today** | left column, both rows | A greeting by time of day; what today's session holds ("Your 6 cards, a line to say back, and one challenge"); **Start today's session** (or **Go again** when kept); the streak: days, and this week as seven day dots (kept white, frozen blue, missed dim, today ringed), freezes left | Today |
| **Continue watching** | top row, two right columns | The last three videos: thumbnail, a bar for where the learner left off, title | Watching |
| **Your words** | bottom middle | The counts on the ladder (Known, You can say it, You can use it) in the rung colours, a bar with one segment per rung, cards due (orange badge), **Review N** | Your words |
| **Talk to Duet** | bottom right | The mascot, one nudge from Duet, a message box with the microphone | Talk |

- **The nudge (proposed):** "Want to try *word* in a sentence?" for a word the learner can say but
  not use yet (the most recently seen one); otherwise "Ask anything, or just chat".
- **Sending from the Talk tile** grows it into Talk with the message sent; the microphone grows it
  into Talk with voice on.
- **Buttons on a tile** do their own thing (Start opens Today straight into the session; Review N
  opens Your words straight into Review); a click anywhere else on the tile opens its page.
- **Under about 900 px wide:** two columns; Today spans both at the top.
- **First run**
  - Today: "Watch something with Duet and today's session builds itself from it." No Start.
  - Continue watching: "Videos you watch with Duet show up here."
  - Your words: "Words you meet while watching land here."
  - Talk: as always.
- **Each tile loads on its own:** a tile that is loading shows its shape (no spinner); a tile whose
  data failed says so in the tile with **Try again**, and the other tiles carry on.

## 3. The pages

Every page has **‹ Home** at the top left (beside the window buttons) and closes with Esc.

- **Today:** the daily session, one step at a time, with step bars at the top (as built in
  `home/daily`, restyled); the end screen shows "done for today" and the streak.
- **Watching:** a grid of videos (thumbnail, title, site, where you left off, when). A click reopens
  the video at that point, as today.
- **Your words:** one list of every word met in the language learnt, and the cards.
  - Filters: the rungs (Seen before, Known, You can say it, You can use it, Ignored), **Has a card**,
    **Due**, **Paused**; search across words, readings, meanings and card text.
  - Each row: the word in its rung colour, its meaning, its rung (orange "due" when its card is).
  - A word's detail: the word large, its reading and meaning, the ladder with its rung lit and what
    moves it up next, where it was met; its card (or cards) when it has one: edit, pause, delete,
    review history (what CardView shows today); **Ignore** / **Bring back**; **Practise with Duet**
    (opens Talk about this word).
  - A card whose word isn't on the ladder (a phrase card) is listed as its own row, by its card.
  - **Review** at the top runs the review session in the page; its end comes back to the list.
- **Talk:** the conversation in one centred column (up to 640 px), the mascot at the top, the
  composer at the bottom (as built in `TalkPage` and `explain/`, restyled).
- **Settings:** grouped lists like macOS System Settings: Learning (language, words mixed in),
  While watching (the quick toggles), Daily reminder, Keys (the two shortcuts), Permissions. Same
  settings as today, same controls behind them; review's own settings stay in Review.

## 4. Motion

- **A tile and its page are one surface** (Motion shared layout, `layoutId`). Opening: the tile's
  content fades out fast (about 80 ms), the solid surface grows to fill the window, then the page's
  content fades and rises in. Closing: the page's content fades out fast, the solid surface shrinks
  to the tile's exact place, size and corners, then the tile's content fades in. The surface is
  never see-through on the way.
- Durations and easing come from `components/motion` (`slow` for the surface, `fast` for the
  content fades); the surface uses one spring with no visible overshoot.
- The gear grows into Settings the same way.
- Tiles lift by 1 px on hover.
- **Reduced motion:** the page and the hub cross-fade; nothing grows or shrinks.
- Opening a page puts the focus on its title; closing puts it back on the tile it came from.

## 5. The look, shared by every window

- **Pill buttons everywhere (proposed):** `.btn` becomes fully round (`999px`) in the home base, the
  side panel and welcome, as on the strip; sizes stay.
- **The glass panel** (`.glass`): the panel style My cards uses today (18 px corners, 1 px line,
  `rgba(22,22,24,0.68)`, blur) moves to `styles/ui.css` and is used by the tiles and by every panel on
  the pages; `.card-box` goes.
- **Words** keep the ladder colours from `base.css` (`--k-*`); orange stays for what needs the learner
  (cards due).
- The mascot (`components/Mascot`) replaces the placeholder in the mockups: on the Talk tile, at the
  top of Talk, and on Today's end screen.

## 6. Data the hub needs

- **Today:** `HomeToday` gains `week`: this study week's seven days, each `kept`, `frozen`,
  `missed`, `today` or `ahead` (worked out from the days store with the streak's own rules).
- **Continue watching:** the last three `WatchingVideo`s (already there).
  - **Thumbnails (proposed):** YouTube's (`https://i.ytimg.com/vi/<id>/mqdefault.jpg`); the home
    window's CSP allows that one host for images. Netflix has no public thumbnail: its videos show
    a dark tile with the title and "Netflix".
- **Your words:** `knowledge.summary(language)` for the counts and the words, joined with the cards
  by `wordKey`; cards due from the review queue.
- **Talk nudge:** from the same summary (a `speakable` word, most recently seen).

## 7. Code

- `home/Home.tsx` becomes the hub: the top bar, the tiles (`home/tiles/`), and at most one open page.
- Pages keep their files (`Today`, `Watching`, `TalkPage`, `SettingsPage`), restyled; `home/Words.tsx`
  and `cards/MyCards` merge into `home/words/` (list, detail, filters); `cards/` keeps the card
  editor and form, used from the word detail.
- `HomePlace` keeps its values for main's "open this place" messages (Dock, menu bar, the strip's ⚙,
  a card's "Open in My cards"); `cards` and `words` both open Your words, `review` opens it in
  Review.
- `windows/home.ts`: the window material and inset buttons.

## Out of scope

The strip, the side panel's layout, welcome's steps, the daily session's and review's logic, new
settings, the waitlist site.

## Checks

- Typecheck, lint, tests and build green; tests for the week of day dots (kept, frozen, missed,
  today, ahead, across a week boundary) and for the words list join (word with a card, card with no
  word, word with two cards).
- In the app: every tile and the gear open and close (mouse, Enter, Esc), focus lands on the page's
  title and comes back to the tile; reduced motion cross-fades.
- Every state of every tile forced in the browser: loading, first run, error with Try again, full.
- The layout sweep clean at 760, 1040 and 1440 wide, with long titles and long words.
- Side by side with the side panel: same material, buttons and corners.
