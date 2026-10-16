# Word-frequency lists

The 10,000 most common words of Spanish, Japanese and Korean, in rank order (the most common first), for reading levels (`src/shared/progress.ts`). Words with no letter in them are left out.

- Source: [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 by Robyn Speer. Lists `large_es`, `large_ja` and `small_ko`.
- Licence: the wordfreq data is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). These lists are an adaptation of it and keep that licence. The app credits it in Settings.
- Japanese and Korean words are as wordfreq splits them (MeCab). Korean verbs and adjectives are stems without 다 (먹, not 먹다), so Duet looks up a Korean dictionary form without its final 하다 or 다 as well.
- Rebuild: `scripts/make-frequency-lists.py` (how to run it is at its top).
