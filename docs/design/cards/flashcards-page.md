# Duet flashcards page (in progress, 2026-10-16)

Reference: `duet-flashcards.html` in this folder (open in a browser; it works). Published copy: https://claude.ai/artifact/HFxVgmDmPyexicY3xhHR3t. The cards themselves are locked: see `README.md` and `duet-cards.html` here.

## Where it lives

Inside the Your words tile of the main window (design E). A switch in the tile header: **Review · Words · Collections**.

## Review

- **Today, compact:** one line, "14 cards today" with "4 new · 2 learning · 8 to review" (real FSRS states, not Anki's three colours) and **Start** beside it.
- **Up today:** the words due, each tinted in its step colour, then "and N more".
- **Your ladder as one bar:** the four steps (Heard, Known, You can say it, You can use it) in their colours, with counts under it. Clicking a step opens Words filtered to it.
- A quiet "Make a card" at the bottom.
- **Back:** every session has "‹ Back to …" at its top left, to wherever it was started from (Review, the word in Words, or Collections), including from the first-run overlay's Start reviewing and from the finish.
- **The session runs inside the tile:**
  - a thin progress line, "N of 14" and "Done for now"
  - the locked cards, with Forgot / Got it
  - Undo (also the ← key: back to the last card, taking back its answer) and Ask Duet in the footer
- **After answering, a quiet note says when the word comes back:** "madrugar comes back in 4 days", or "is Known now, and comes back…". It shows *after* the choice, never on the buttons.
- **Keys:** Space shows the answer, then means Got it; 1 is Forgot; ← is Undo. Review only moves forward otherwise: going back always takes back the answer.
- **The finish:** "That’s today’s cards." Duet (the real mascot) cheers, then settles proud, and a few paper bits in the word colours flutter down once. No button: the tile switch is the way on.

- **Two different moves.** Showing the answer opens the same card: it grows to the back's height, the word glides into the headword, and the entry rises in line by line. Answering puts the card away (up for Got it, down for Forgot) and deals the next from the stack behind it; Undo brings the last card back from the left.
- **How cards work:** the first time Review opens, a short tour of the page itself, on sample cards (`flashcards/sample.ts`). Each stop rings the part it's about, with a small card beside it (Duet, a line, Back / Next, Skip tour):
  1. today's cards
  2. a sample review you can answer, with the keys
  3. the ladder
  4. a sample word's page in Words
  5. Collections and By video
  6. every kind of card, as a reference, then **Go to Review**

  While it runs, nothing is saved, rated or scheduled; Make a card and Ask Duet wait until it's over. When it ends, the learner's own page comes back: empty for a new learner. Skip or Esc goes back where you were; finishing goes to Review. The **?** in the tile header replays it.
- **First time a kind of card shows up**, one line above it says what it asks ("New card · Gap card. Say it out loud, or type it."), until it's answered.

## Words (Anki's Browse, made simple)

- **Left:** search, the steps as filters, and words in their step colour. "Today" marks words due today.
- **Left:** a small dot marks words due today.
- **Right:** its step with a small ladder and "Next review in …" on one line, then the word's dictionary entry (the same as its card's back).
- **Actions:**
  - **Practise now:** review it anytime, off schedule.
  - **Recall sooner:** brings it back sooner without counting it as forgotten (a higher recall target for that word). The honest alternative to pressing Forgot just to see a word again.
  - Edit card, Pause and Ignore this word sit in a ⋯ menu.
- **A word with no video yet** (added or imported) says: "No video yet. The first time you hear it while watching, Duet adds that moment to its card."

## Collections (Duet's name for Anki's decks)

- **Collections as piles of index cards:** From your videos, imported decks (Spanish 5000), imported tags (Chapter 3 verbs). The top card shows a real word from it in its highlighter; a bigger collection is a taller, slightly askew pile. Under it: the name and "11 to review · 142 cards". Click the pile to review it; a pile with nothing due is quiet ("All done today"). The daily review mixes them all.
- **Bring in an Anki deck** is a plain text link in the Collections heading.
- **By video:** a plain list. Each row has the video's still with its line, the title, when it was watched, its words in their own highlighter ("madrugar, gracias … and 19 more"), and "Review 4 →".
- No boxed tiles, icons in squares or pill buttons per row.
- Make a card lives on Review, not here.
- Show the Collections grid only once there's more than one group; otherwise By video only.

## Make a card

- Type the word or phrase; Duet fills in the meaning, a line ("leave empty and Duet writes one") and the collection.
- The card's back previews live beside the form.
- **Keep**, or **Keep and make another**. Today then says "… is kept. It joins your next review."

## Notes for building

1. **Cards without a video fill themselves in.** The first time the word is heard in a video, Duet attaches that moment (video, time, line) to the card once. The card can then show the sentence front and a replay.
2. **"Last heard" and "Heard N times" are never stored on the card.** The card reads them from the word's encounter record each time it's shown.
3. **No cost during playback.** Duet already matches and counts every subtitle word. Finding the card is a lookup by `wordKey`, in the background after each line.
4. **Picture cards:** ask to capture a still from the video, else an upload, else an option to generate one, else no picture.
5. **Card backs' dictionary (`app/src/main/dictionary`), with as few AI requests as possible:**
   - What Duet already knows comes first and costs nothing: the card's meaning and explanation, and the line model's work on the line (the word's dictionary form, its English there, its job).
   - The rest (pronunciation, syllables, part of speech, gender, other meanings, related words, an example) comes from the app's own AI, once per word, and is kept.
   - It's fetched ahead, several words per request: when a card is saved, when Review opens, when a session starts. A card on screen asks only if its entry wasn't fetched ahead.
   - Make a card's lookup is reused by Keep: the meaning and Duet's example line need no second request. A typed form is filed under its dictionary form.
   - Words without a card never cost a request.
   - Offline dictionary packs would replace the AI part: see `dictionary-packs.md`.

## Left out of Anki on purpose

- three counts per deck
- four rating buttons with timings
- spreadsheet columns
- separate Add and Stats screens

The steps replace stats.

## Open

- The Home canvas (claude.ai Design canvas) couldn't be published from the last session, so it's behind these files.
