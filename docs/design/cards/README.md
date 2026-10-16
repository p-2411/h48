# Duet cards (locked 2026-10-16)

The flashcard design for the main app. `duet-cards.html` is the reference: open it in a browser. Published copy: https://claude.ai/artifact/HMAzVNwmPLxHyocdZUJW9j

## What the learner sees

**Every card ends with one question: Forgot or Got it.** No return times, no Hard or Easy. Duet works out how hard it was (time before revealing, replays, how cleanly a spoken answer was said) and grades the scheduler itself: Forgot = Again; Got it = Good, or Hard / Easy when those signals say so.

**The front depends on the word's step and on what Duet has for it:**

| Step (on screen) | Card | Front |
|---|---|---|
| Heard | Sentence card (the default when there's a line) | The video moment if there is one, the word large, its line |
| Heard | Word card (no line yet: basic Anki decks, hand-made cards) | The word and its sound |
| Heard | Listening card (now and then, a twist on the sentence card when there's audio) | Play button, words hidden, "Double-click to hear it slower" |
| Heard | Picture card (only when there's a picture) | The picture, "What's this called?" |
| Known | Gap card | The line with the word missing, its English, a mic ("or type it") |
| You can say it | Use-it card | A small situation, "Use madrugar", a mic |
| You can use it | Keep-fresh card | The word, "Still know it?" |

**The back is always the same dictionary entry, in this order:**

1. Headword split into syllables (`ma·dru·gar`), Source Serif 4 500, with its step's highlighter behind it.
2. Pronunciation (IPA) with a play button, and the part of speech; gender for nouns (`la sartén`).
3. The meaning that matches the line, Source Serif 4 400 about 23px.
4. **Where you last heard it**, like a dictionary quotation: the line in Source Serif 4 italic 20px with the word bold; under it a replay button, "Last heard in **video** at time" and "Heard N times". A word not heard yet: "An example by Duet" and "Not heard yet".
5. **Tips**, one folded row with a down arrow, closed by default; no tips, no row. Inside: Careful first, then Listen for and Tip, then the other places it was heard, other meanings, related words, a saying.
6. Forgot (outlined) and Got it (filled), 44px tall, side by side.

On spoken cards, what you said and Duet's one-line note sit above the entry. The use-it card has no Tips (Duet's verdict is the tip).

## Rules

- Type: Source Serif 4 only at about 20px and up; Inter for everything else (`docs/brand/typography.md`).
- Word states: labels and colours from `docs/brand/word-colours.md` (Heard yellow, Known orange, You can say it blue, You can use it green; New to you lilac, Ignored stone; never white or black).
- Saying a word out loud is what moves it to You can say it; typing counts as recall.
- Forgetting brings a card back sooner, never down the ladder.
- Each kind of question keeps its own schedule; a word asks only one question a day.
- Picture cards get their picture by: asking to capture a still from the video, else an upload, else an option to generate one, else no picture.
