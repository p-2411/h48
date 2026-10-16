# Dictionary packs

Status: **built** (2026-10-17). Card backs and the word page read an offline dictionary per language first. The app's AI writes an entry only for a word the pack lacks, and that fallback can be turned off.

- Reader: `app/src/main/dictionary/packs.ts`. Used by `app/src/main/dictionary/index.ts` (class `Dictionary`).
- Builder: `app/scripts/build-dictionaries.mjs` (how to get the raw data is at its top). Run it with `npm run dictionaries -- <folder>`.
- Tests: `app/scripts/test-dictionary.mjs` (`npm run test:dictionary`).
- Credits: Settings → Sources and licences (`app/src/shared/sources.ts`, `SourcesPage.tsx`).

## Sources

| Language | Words, meanings, word type | Pronunciation | Other | Licence |
|---|---|---|---|---|
| Spanish | Wiktionary (kaikki.org) | Wiktionary IPA, syllables | gender, examples, related words | CC BY-SA 4.0 + GFDL |
| Japanese | JMdict (EDRDG) | kana from JMdict, IPA from Wiktionary, pitch accent from UniDic 2.1.2 | examples, related words from Wiktionary | CC BY-SA 4.0 (JMdict, Wiktionary); BSD (UniDic) |
| Korean | Wiktionary (kaikki.org) | Wiktionary IPA | examples, related words | CC BY-SA 4.0 + GFDL |

Which words are kept: wordfreq 3.1.1's lists (CC BY-SA 4.0), the most common first.

Each licence was read on its own site on 2026-10-17:

- **Wiktionary** ([copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)): CC BY-SA 4.0 and GFDL. kaikki.org's extracts keep the same licences. Commercial use is allowed. Our packs are adapted data, so they keep CC BY-SA.
- **JMdict** ([EDRDG licence](https://www.edrdg.org/edrdg/licence.html)): CC BY-SA 4.0, with no limit on commercial use. An app must credit it on a separate screen reached from a menu, such as "About" or "Sources", and not only on a launch screen. That is why Sources is its own screen. The licence also asks apps to have a way to update to recent versions. Our way: we rebuild the packs before a release, and the app updates itself.
- **UniDic 2.1.2** (through `unidic-lite` 1.0.8): GPL, LGPL or BSD, as the user chooses. We use BSD. NINJAL's [commercial-use page](https://clrd.ninjal.ac.jp/unidic/commerce_use.html) says UniDic 2.x is free software. The BSD notice is shown in full on the Sources screen.
- **wordfreq** ([README](https://github.com/rspeer/wordfreq)): its data is CC BY-SA 4.0.

Not used: Kanjium (unclear sources for its pitch data), Wadoku (non-commercial only), Yomitan code (GPL).

## What a pack is

One SQLite file per language, read with Node's built-in `node:sqlite` (no native add-on):

- `entries (id, entry)`: one row per word. `entry` is the `DictEntry` JSON (`app/src/shared/flashcards.ts`), with only the fields a card uses: word, syllables, IPA, Japanese reading and pitch, part of speech, gender, up to 4 meanings, up to 3 related words, and one short example.
- `words (word, id)`: the keys that find an entry. A key is NFC, trimmed and lower case, the same as `wordKey` in `app/src/shared/knowledge.ts` without the language. The keys are:
  - the dictionary form, which is what the line model gives as `token.base`;
  - for Japanese, every everyday kanji spelling and every kana reading. When two words share one kana spelling (はし), the commoner word has it;
  - for Spanish, the common inflected forms (hablamos → hablar, fue → ser), for a word typed in Make a card;
  - for Korean, particles and endings without their hyphen (에서 → -에서).
- `meta`: `version` (for example `es-2026.10`) and `built`.

Entries keep only the most common 50,000 words for each language. A word counts as common if its most common form is common. Names give way to ordinary words that are spelt the same.

## Size and coverage (built 2026-10-17)

| Pack | Entries | Keys | On disk | Gzipped |
|---|---|---|---|---|
| `es.sqlite` | 49,978 | 110,715 | 10.7 MB | 3.3 MB |
| `ja.sqlite` | 49,421 | 102,110 | 10.7 MB | 3.7 MB |
| `ko.sqlite` | 33,472 | 33,841 | 5.7 MB | 2.0 MB |

Coverage of each language's 10,000 most common words, measured against the reading-level lists (`app/src/main/progress/frequency`):

| | Top 1,000 | Top 10,000 |
|---|---|---|
| Spanish | 99% | 96% |
| Japanese | 90% | 84% |
| Korean | 92% | 69% |

These lists hold words as wordfreq splits them, so the numbers are lower limits. Most Japanese and Korean misses are not dictionary forms: they are verb stems and endings (食べ, なっ, 했, 습니다), letters, and some names. The line model gives a dictionary form (食べる, 하다), and the pack has those.

## Shipped inside the app, not downloaded

The packs are in `app/resources/dictionaries` and ship with every build. electron-builder unpacks `resources/**`, so SQLite reads a real file. Together they add about 9 MB to the download and about 27 MB on disk.

We ship them instead of downloading each one on first use because:

- They are small. The plan was for a download only if the packs were tens of MB each.
- A word page works offline from the first launch. It never waits for a download or shows a half-ready state.
- No hosting, `index.json`, checksum, resume or swap logic to build and keep working.
- They update with the app, which already updates itself. That also meets JMdict's licence condition on updates.

If a pack grows large, or more languages are added, move to the download plan: a language's pack is fetched when the learner picks that language.

## In the app

1. `Dictionary.cached()` and `Dictionary.entry()` read the pack first. The pack answers in about a millisecond and sends no request.
2. When the pack doesn't have the word, they use an entry the AI wrote earlier, which is kept in the `dictionary` table.
3. When the pack doesn't have the word and nothing was kept, the AI writes the entry once. Then the `dictionary` table keeps it. The AI does this only while `aiFallback` is on. It is on by default. To turn it off, start the app with `DUET_AI_ENTRIES=off`, or pass `aiFallback: false` to `new Dictionary()`.
4. Pack entries are not copied into the database. A newer pack takes effect as soon as the app updates.
5. Nothing waits on an entry. A word with no entry still gets a card.

## Rebuilding

Get the raw data (see the top of `build-dictionaries.mjs`). Then run `npm run dictionaries -- <folder>`. The script prints the size and coverage of each pack. Rebuild before a release a few times a year, then commit the new files.

## Open

- Pitch accent comes from UniDic 2.1.2 (2017). A newer UniDic (3.x, also BSD) would need its full download, which is about 1 GB.
- Spanish and Korean senses come in Wiktionary's order. This order is usually the most common first, but not always (papa: "pope" before "potato").
- A second pack for each language with conjugation tables, for a "how it changes" view.
