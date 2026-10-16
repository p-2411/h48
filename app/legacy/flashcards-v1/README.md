# Legacy: Your words and Review, first design

The word list and review screens from before the flashcards module (`src/renderer/src/home/flashcards/`,
designed in `docs/design/cards/`). Nothing imported these files any more; moved here on 2026-10-17.

Kept for reference only. It is outside `src/`, so it isn't built or typechecked, and its relative
imports point at where the files used to live (`app/src/renderer/src/<same path>`).

| File | What it was | Replaced by |
| --- | --- | --- |
| `home/words/YourWords.tsx` | Your words page: list on the left, the word's card(s) on the right, Review N at the top | `home/flashcards/Flashcards.tsx` |
| `home/words/WordList.tsx` | The ladder-filtered word list | `home/flashcards/Words.tsx` |
| `home/words/WordDetail.tsx` | One word with its cards | `home/flashcards/Words.tsx` |
| `review/Review.tsx` | One card at a time, recall, reveal, four ratings | `home/flashcards/Session.tsx` (Forgot / Got it) |
| `review/ReviewSettings.tsx` | Review settings under the old Review | — |
| `review/useReviewSession.ts` | The old review queue hook | `main/flashcards/session.ts` |
| `cards/CardView.tsx` | A card's content, source, due date and history | the dictionary card backs |
| `cards/NuanceBox.tsx`, `cards/labels.ts` | Parts of CardView | — |
| `home/useSurface.ts` | The tile-grows-into-page transition | — |

Still in `src/` because live code or tests use them: `home/words/join.ts`, `useWordsData.ts`,
`words.css`, `review/queue.ts` (`scripts/test-cards-ui.mjs`), `review/review.css`.

To bring a file back: `git log --follow` on its path here, or copy it back to `src/renderer/src/`.
