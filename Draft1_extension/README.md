# Duet — learn Spanish with YouTube (MVP)

Duet puts a large panel next to a YouTube video, never on top of it. Every word in the panel is colour-coded by what it does in the sentence:

| Colour | Meaning | Examples |
|---|---|---|
| Blue | Things (nouns) | dragón, sangre |
| Orange | Actions (verbs) | trae, buscando |
| Green | Describing words | oscuro, sola |
| Purple | People and pointers (pronouns) | alguien, te |
| Pink | Names | Sintel, Scales |
| Grey | Glue words | de, la, a |

Matching words have the same colour in both languages, so *blade* and *hoja* are both blue. Hover a word and its partner lights up in the other lines.

## Install (Chrome Developer Mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `Duet-extension` folder (the one containing `manifest.json`).
4. Pin Duet from the puzzle-piece menu, then click it and choose **Open the demo clip**.
   Or go directly to: https://www.youtube.com/watch?v=eRsGyueVLvQ&t=100s
5. The first line of dialogue is at **1:47**.

After you edit any file, click the reload arrow on Duet's card in `chrome://extensions`, then refresh YouTube.

## What's in the MVP

- **Mixed line.** Your English sentence with some words swapped into Spanish (Spanish words are highlighted). The **Spanish 1–5** control sets how many get swapped. Nouns are swapped first, then verbs, then describing words.
- **Full Spanish line**, using the official human translation.
- **Guess first** (on by default). The English is blurred, so you try the Spanish before checking. This makes you pay attention to the Spanish instead of just reading the English.
- **Click a word to save it.** Saved words go into **My words**.
- **Review.** Flashcards that ask you to recall each word, shown with the movie line it came from, and scheduled using spaced repetition (Leitner boxes). Once you know a word, it always appears in Spanish while you watch, so the more you learn, the more Spanish you see.
- **Script tab.** The whole transcript. Click any line to jump the video there.
- **Any video mode.** On any other video, turn on captions (CC) and Duet mixes Spanish into each caption using a starter dictionary of about 250 words. These are word-for-word swaps, so verb forms won't always be grammatical. Curated clips get full, human translations.
- Matches YouTube's light and dark themes. Moves under the video in narrow windows, or whenever you click the dock button.

## Files

```
manifest.json        Chrome MV3 manifest
src/content.js       The panel: video sync, rendering, hover linking, saving, review
src/panel.css        Panel styling (inside a shadow root, so YouTube's styles can't break it)
src/data-sintel.js   Hand-aligned English↔Spanish lines for the demo clip (generated)
src/lexicon.js       Starter dictionary for any-video mode
popup/               Toolbar popup (on/off, level, dock, stats)
tools/build_data.py  Edit the aligned lines here, then run: python3 tools/build_data.py
```

## Adding another clip

Add lines to `tools/build_data.py` in the same format (`english|spanish|type` pairs, plus Spanish word order) and register the new YouTube video ID. Use content you have the rights to, such as Creative Commons films or your own recordings.

## Credits

Demo clip: *Sintel* © Blender Foundation, CC BY 3.0. English and Spanish subtitles from durian.blender.org.
