# Duet: typography

Locked on 2026-10-16.

| Role | Typeface | Notes |
|---|---|---|
| Duet's voice and titles (what Duet says, page titles, big numbers, headlines) | **Source Serif 4** | Weight 500 at headline sizes (about 50 px), 400 around 31 px and below. |
| Interface (labels, buttons, pills, the caption strip, body text) | **Inter** | Unchanged. |
| Japanese, Korean | **Noto Sans JP**, **Noto Sans KR** | Unchanged. |

## The rule

**Serif for voice, sans for interface.** Source Serif 4 is only for what Duet says and for large titles, at about 20 px and up. It is never used on a control or for small text: buttons, pills, labels, navigation, settings, lists, and the caption strip on the video are always Inter. The strip is read in a glance over moving video, so it stays a sans whatever else changes.

Source Serif 4 replaces **Instrument Serif**. Instrument Serif had become a common default in AI-generated designs and read as such; Source Serif 4 keeps the elegance with a standard, widely used, very readable face (Adobe's open-source serif, on Google Fonts, SIL Open Font License).

Other candidates looked at, for the record: handwritten (Klee One, Kalam, Patrick Hand, Gochi Hand), clean sans (Nunito, Recursive, Figtree, Plus Jakarta Sans, Lexend, Atkinson Hyperlegible) and serifs (Libre Caslon, DM Serif Display, Playfair Display, Cormorant Garamond, EB Garamond, Lora, Crimson Pro, Spectral, Gelasio, Literata, Newsreader).

## Where it still needs changing

The app bundles its fonts (it fetches none), so switching needs the font file first:

- Add Source Serif 4 (variable TTF and its OFL licence) to `app/src/renderer/src/assets/fonts/`, and point the `@font-face` in `app/src/renderer/src/home/workspace.css` at it.
- Replace `'Instrument Serif'` in `app/src/renderer/src/styles/home-tokens.css` (`.serif`) and `app/src/renderer/src/home/pages.css`, and check the sizes there: Instrument Serif is narrow and tall, so Source Serif 4 at the same size runs wider.
- Design files (`docs/design/home-v2`, `app/design-preview`) still show Instrument Serif; new work uses Source Serif 4.
