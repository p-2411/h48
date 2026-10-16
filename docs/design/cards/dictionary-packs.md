# Dictionary packs (future)

Status: **planned, not built.** Today a card's back comes from what Duet already knows about the word plus the app's own AI, filled in once and kept (`app/src/main/dictionary`). This is the plan for replacing the AI part with an offline dictionary per language, so card backs cost nothing and work without the internet.

A prototype reader for the source data is in `app/src/main/dictionary/wiktionary.ts` (not wired in, tested in `scripts/test-flashcards.mjs`).

## The idea

One small, prebuilt dictionary file per language. We build it once on our side, and each learner's app downloads the file for the language they learn.

**Not** a lookup per word against a website, which grows with every user and every word. **Not** the raw source files on the learner's machine (Spanish is 95 MB compressed, about 1 GB unpacked), which take minutes of processing there.

## Source

Wiktionary, through kaikki.org's extracts: one JSON object per line, one per word and part of speech.

| Language | Raw download (compressed) |
|---|---|
| Spanish | 95 MB |
| Japanese | 48 MB |
| Korean | 21 MB |

Licence: CC BY-SA. The packs keep that licence, and the app credits it (Settings → About: "Dictionary data from Wiktionary, CC BY-SA").

## Building a pack (our side)

`scripts/build-dictionary.mjs <language>` reads the raw file line by line and keeps **every word**, with only these fields:

- word, syllables, pronunciation (IPA), part of speech, gender
- the first few meanings, with short usage labels ("colloquial", "Spain")
- one or two example sentences per meaning
- a few related words

It also keeps a **forms** table (madrugué → madrugar), so a typed form finds its word. Words met in videos don't need it: the line model already gives each word's dictionary form.

It drops translations into other languages, etymologies, full conjugation tables and wiki bookkeeping. That's most of the raw file.

Output: `<language>.sqlite` with two tables, `entries` and `forms`, plus a version label (`es-2026.10`). We expect a few MB to a few tens of MB per language. Measure it when building, and split into a core pack (the most common ~50,000 words) and a full pack only if it's too big.

Then rerun when fresher data is wanted, a few times a year. It's one run per language, never per user.

## Hosting

The packs and an `index.json` (language, address, version, size, checksum) go on static hosting: GitHub Releases to start, Cloudflare R2 if it grows (no charge for downloads). Nothing on our side does work per user.

## In the app

1. **Picking a language** (first run, or in Settings) downloads its pack in the background, with quiet progress ("Getting the Spanish dictionary… 40%"). It resumes after an interruption, checks the file against its checksum, and only then uses it. It's saved in Duet's data folder, beside `duet.db`.
2. **Looking up a word** reads the local file (about a millisecond, offline): the word, or its form → the word.
3. **Before the pack arrives**, card backs use what they have, so nothing waits. The AI fill-in stays as the fallback until then, and for words the pack lacks.
4. **Updates:** the app checks `index.json` now and then, downloads a newer pack and swaps the file. Cards and progress are in `duet.db` and are never touched.

Only the chosen language is downloaded. Spanish, Japanese and Korean are built first.

## Open

- Whether to keep the AI fill-in as a fallback once packs exist, or rely on the pack alone.
- An optional second pack per language with conjugation tables, for a "how it changes" view.
