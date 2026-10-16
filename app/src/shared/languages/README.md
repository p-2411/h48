# Languages

Each language Duet teaches is one folder here, named by its ISO 639 code (`es`, `ja`, `ko`). Everything about the language lives in its folder. The rest of the app only reads the shape in `module.ts`, and `scripts/languages.mjs` lists the folders in `registry.ts`. To add a language, add a folder. You change no other file.

## What a folder holds

| File | What it is | Needed |
|---|---|---|
| `index.ts` | The language: its name, how to recognise it, how to romanise it, the welcome sample, tutor prompts, voice tag, font, reading-level rules, dictionary rules. Exports it as `default`. | yes |
| `welcome.ts` | The first run: Duet's hello, the placement test (two words in each of four frequency bands, each with three wrong meanings), the check line, "Perfect!". | yes |
| `frequency.json` | Its 10,000 commonest words, commonest first (see below). | yes |
| `mascot.ts` | Its everyday phrases for the mascot's reactions (thanks, hello, "almost", laughing…). | no: the mascot still reacts to English and punctuation |
| `sources.ts` | Open data only this language uses, credited in Settings → Sources. | only with a dictionary of its own |
| `dictionary.mjs` | A custom dictionary-pack build. Without one, the standard build uses its English Wiktionary. | no |

Outside the folder, made by scripts from it:
- `resources/dictionaries/<code>.sqlite`: the dictionary pack.
- `src/renderer/public/voice/welcome/*.mp3`: the first run's recorded lines.

## Adding a language

1. **Copy the closest folder.**
   - `es` for a language in Latin letters (French, German, Italian, Portuguese).
   - `ko` or `ja` for its own script.

   Rename the constant and change everything in `index.ts`:
   - `recognise`: its commonest words and marks, or its script.
   - `reading`: how to write it in Latin letters, unless it already is.
   - `sample`, `phrasing`, `tutor`.
   - `voice`: the tag and the name the voice is asked for.
   - `font`.
   - `rankByParts`, `listForms`, `article`.
   - `dictionary.letters` and `dictionary.exampleLength`.

   If `others.ts` lists it as an untaught Latin language, leave that entry: it stops counting once the folder exists.
2. **Write `welcome.ts`.** Pick words from the frequency bands of its list, and have a native speaker check them. `video` can reuse one of `src/renderer/public/video/welcome`.
3. **Make the frequency list:** `scripts/make-frequency-lists.py <wordfreq data> <code>` (how to run it is at the top of the script).
4. **Build the dictionary pack.** Download its `kaikki.org-dictionary-<Name>.jsonl.gz`, then run `npm run dictionaries -- <raw data folder> <code>`. The pack's coverage line shows how many common words it finds.
5. **Record the welcome lines:** `npm run voice:welcome` (needs `OPENAI_API_KEY`). It records only the lines that have no clip yet.
6. **Run `npm test`.** `test:languages` names anything the folder still lacks. Then watch real shows in the language: check the phrases, the swapped words, cards and voice.

The registry updates by itself before `npm run dev`, typecheck, test and `build:mac`. Run `npm run languages` to update it by hand.

## What stays shared

- The server.
- Settings and the language picker.
- Caption detection (`main/detect.ts`).
- The line, entry and tutor prompts.
- Cards.
- The mascot's English phrases.

These read every language from here. The learner's own language is English throughout. Teaching speakers of another language is a different, larger change.

## Word-frequency lists

The 10,000 most common words of each language, commonest first, are used for reading levels (`src/shared/progress.ts`) and to choose which words the dictionary packs keep. Words with no letter in them are left out.

- Source: [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 by Robyn Speer. Each language uses wordfreq's large list (`large_es`, `large_ja`), or its small one when there is no large list (`small_ko`).
- Licence: the wordfreq data is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). These lists are an adaptation of it and keep that licence. The app credits it in Settings → Sources and licences (`src/shared/sources.ts`).
- Japanese and Korean words are split the way wordfreq splits them (MeCab). Korean verbs and adjectives are stems without 다 (먹, not 먹다). So Korean's `listForms` also looks a word up without its final 하다 or 다.
- Rebuild: `scripts/make-frequency-lists.py` (how to run it is at the top of the script).
