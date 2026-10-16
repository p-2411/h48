# Duet icons: handover

The Duet mark is designed and locked, and every icon file the app ships has been generated from it.
What's left is to check them in real builds, commit them, and (optionally) apply the same look to the
mascot over captions.

Design pages, for reference:
- Logo explorations, rounds 1–9 (round 9 is the locked mark): https://claude.ai/artifact/B1WBzxW4X2fpTAmfQxZybE
- Mascot over video demo: https://claude.ai/artifact/Gb9uA2jMRgG5VCVSpqRBK9

## The mark

- Pill eyes with smiling lower lids (the bottom of each eye lifts a little).
- Short pupils, converged 1.5 units toward the nose so the face looks at you rather than through you.
- A soft pen-stroke smile, 3 units left of centre, heavier where the pen lands.
- Small deliberate imperfections so it reads as drawn: a slow wobble on every outline, the right eye
  1.5% wider and tilted the other way, the two pupils slightly different in length, weight and angle.
- Flat colour. No gloss, gradients or glow in the artwork.

| | Tile | Eyes | Pupils | Smile |
|---|---|---|---|---|
| Mono light (the app icon) | `#F6F7F6` | `#17211F` / `#18221F` | `#F6F7F6` | `#3A4644` |
| Sea Ink (dark) | `#080D0D` | `#EDF6F4` / `#EFF7F5` | `#080D0D` | `#C6DDD9` |

Light tiles get a faint ink rim (8%), dark tiles a faint white rim (9%), so they separate from a
taskbar or dock of the same tone. At 32 px and below a small-size version is used: same face,
thicker pupils and smile, slightly larger.

## Where it lives

- `app/scripts/duet-mark.mjs`: the mark as geometry, the only definition. Change the design here.
- `app/scripts/generate-icons.mjs`: writes every file below from it. Runs inside Electron, so
  nothing extra needs installing.

```bash
cd app && npm run icons
```

| File | Used for |
|---|---|
| `app/build/icon.icns` | macOS app icon (Apple's 824-in-1024 grid, soft shadow; small art for 16 and 32 pt) |
| `app/build/icon.ico` | Windows app icon: 16, 20, 24, 32, 40, 48, 64, 256 (small art at 32 and below) |
| `app/build/icon.png` | Linux (512, rounded square) |
| `app/resources/icon.png` | Dev dock icon on macOS |
| `app/resources/trayTemplate.png`, `@2x` | macOS menu bar (template: one colour, pupils cut out) |
| `app/resources/tray.png`, `@2x` | Windows tray (small-size tile, drawn for 16 px) |
| `app/build/icon-source/` | SVG masters (macOS and Windows, light and dark, full and small), bare marks, 1024 px PNGs |
| `app/build/icon-source/icon-composer/` | Eyes and features as separate layers, for Apple's Icon Composer (macOS 26 glass) |
| `waitlist/app/favicon.svg` | Website favicon; follows the visitor's light or dark setting |
| `waitlist/app/apple-touch-icon.png` | iOS home screen (180, Mono light) |

electron-builder already reads `build/icon.icns` and `build/icon.ico` (`buildResources: build`),
so `electron-builder.yml` needs no change.

### Runtime light and dark icons

The generator also writes `resources/icon-light.ico`, `icon-dark.ico`, their PNG counterparts,
`dock-light.png`, `dock-dark.png`, and `tray-light.png` / `tray-dark.png` with @2x variants.
`app/src/main/icons.ts` selects the running Windows window/taskbar icon from the system appearance
and the macOS Dock icon from the OS appearance, including changes while Duet is open. The tray uses
the matching small artwork on Windows and the existing system-coloured template on macOS.
Linux uses the app's native appearance (currently dark). Caption surfaces remain dark.

The executable, installed shortcuts, Finder and Linux launcher retain the canonical Mono light
packaged icon. These static package assets do not dynamically switch with the running app.
macOS Dock switching is implemented but must still be verified on a Mac.

## Code changes

- `app/src/main/tray.ts`: Windows now uses `resources/tray.png` instead of shrinking the 512 px
  app icon to 16 px. macOS still uses the template.
- `app/package.json`: adds the `icons` script.

## To do

1. **Check in real builds.** `npm run build:win` and `npm run build:mac`, then look at the icon in the
   taskbar, Start menu, dock, Finder, Alt-Tab and the tray. Nothing has been tested in a packaged app yet.
2. **Commit only the icon files.** Other work is uncommitted in the same tree (for example
   `explain/Conversation.tsx`, `overlay/TalkBubble.tsx`, `package-lock.json`). Stage the paths in the
   tables above plus `docs/brand/icons.md`. In `app/package.json`, only the `"icons"` script line is
   from this work.
3. **Website.** `favicon.svg` and `apple-touch-icon.png` replace the old two-rectangle mark. Revert them
   if the site isn't ready to switch. `og.png` was not touched.
4. **Optional, macOS 26 glass.** Build an `.icon` file in Icon Composer from the two layers, with the
   tile colour as the background. Check whether electron-builder supports `.icon` before relying on it;
   the flat `.icns` works either way.
5. **Not touched:** `Draft1_extension/icons/` (old browser extension).

## The mascot over captions (decided, not built)

From the demo page. These apply to the overlay, not the icon files.

- Over video, always use Sea Ink, whatever the app's theme. The backing follows the picture, like
  subtitles. Light mode applies to the home window and panels.
- Mascot on top of the caption bar, joined as a **Tab**: a pill that grows out of the bar's top edge,
  one solid surface. No drop shadows; a 1 px rim separates it from the video.
- Solid surfaces, not 90% opacity, so the mascot and the bar never darken where they overlap.
- Eyes, pupils and smile fully opaque. Emotion tints change the face, never the backing.
- Optional glass: a soft top-to-bottom falloff on the eyes and a thin light top edge. No sparkles or glow.
- Why the current mascot is hard to see: `mascot.css` uses white glass at 4–34% opacity and
  `backdrop-filter`, but the overlay is a transparent window (`overlay.ts`), so the blur can't reach
  the video behind it.
- Gaze: on the icon the pupils are converged, looking at the viewer. In the app, the mascot looks down
  at the captions when it sits on the bar, at the person when talking, and briefly up when thinking.
