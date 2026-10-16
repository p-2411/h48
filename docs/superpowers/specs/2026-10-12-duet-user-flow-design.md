# Duet user flow: design

Date: 2026-10-12
Status: agreed, built in pieces 1–4 (2026-10-12)

## Purpose

This spec maps how a learner uses Duet, both while watching and over months, and what each screen is for. Later work (the talk-to-Duet button, the tutor page, onboarding, the visual pass) builds on it.

## What we agreed

- **One flow for every learner.** It starts gentle for a near-beginner and opens up as the learner improves. The mix level is the control (Auto, the default since the knowledge ladder, follows the words the learner knows). *Superseded:* known and unknown words were to be a friend's design; the knowledge ladder replaced it (2026-10-12).
- **Two outcomes.** Understand shows, and speak about them.
- **Watching must not feel like studying.** The strip asks for nothing. Anything active happens only when the learner chooses, or at the two moments in "Checkpoints".
- **Watch-first.** The strip and a local watch log are the centre. The daily session and the home base are built from what the learner watched.
- **The main habit is a short daily session.** A full home base is there for learners who want more.
- **Progress is the streak, the Words place's count per rung** (added with the knowledge ladder), **and each video's % understood and reading level** (added 2026-10-16: see `2026-10-16-progress-tracking-design.md`). The strip never shows them.

## 1. While watching: the strip

At rest the strip shows the mixed subtitle line and the status dot. It shows no counts, review prompts, scores or streaks.

The learner goes one step deeper at a time. Each step is one gesture.

| Depth | Gesture | Result | Video |
|---|---|---|---|
| Glance | none | The mixed line, target-language words coloured by their rung on the knowledge ladder | plays |
| Peek | hover the strip or a word | The original line and the English; a word's card (meaning, Save) just above the strip | plays |
| Ask | Explain, the mascot button, or the shortcut | Explain opens the side panel (explanation and chat). The mascot button pops Duet up above the subtitles for voice | pauses; plays on close |

The action row keeps: Explain, the line star (save the line), Replay, settings. The talk-to-Duet mascot button sits against the left side of the subtitle box (see "Related decisions").

While the learner watches, Duet records the watch log (section 5) with nothing on screen.

## 2. Checkpoints and the glow

Checkpoints are short challenges built from what the learner just watched. They are **off by default**. After the learner's third video with Duet, Duet turns them on by itself, unless the learner has already chosen (one switch in Settings).

### When Duet offers one

- **The learner pauses.** After about 2 s, and only for a pause the learner made. Pauses made by Explain, Wait or the talk-to-Duet button do not count.
- **A natural break.** The end of a scene or conversation, judged from the dialogue by the text model: a video's whole transcript is split once, or, without a transcript, the last few lines are judged when the dialogue pauses.

Duet offers at most one checkpoint every 5 minutes. After an offer is left alone, at most one every 10 minutes. Offers never stop, and taking one brings back the normal pace. There is no end-of-video checkpoint.

### The glow

A soft glow breathes around the strip's edge (redesigned since: Apple Intelligence colours flowing behind the strip). There is no text and no sound. A click on the strip opens the checkpoint above the strip, where the word card opens. An offer stands 10 s unless clicked (playing on doesn't end it), then fades. While the checkpoint is open the glow stays; when it is done, it fades in 0.5 s.

### Content

Each checkpoint uses lines from the last few minutes of the watch log. It prefers words the learner hovered or saved; with the knowledge ladder it picks by rung (a line known word for word is said back, else a word only seen is recalled).

- **Recall a word:** a line from the scene with one word blanked. The learner picks one of three.
- **Say the line:** Duet says the line in its own voice, as in the daily session, and the learner says it back. Duet gives a short note on pronunciation and tone.
- **What did they mean?:** one comprehension question about the scene.

A pause or a break offers one challenge (under a minute). A word missed becomes a card.

### Results

- A word the learner missed becomes a review card. If it already has a card, that card comes due sooner.
- A finished checkpoint counts toward the day's streak.

## 3. The daily session

The daily session is the first thing on the home base ("Today"). The Dock icon and the menu bar's "Open Duet" open it. It never shows while the learner watches.

It lasts about 5 minutes and stops there, even if more is due:

1. Due review cards, in the scheduler's order (learning, then due reviews, then new), at most 12.
2. One "say the line" from the last video watched. Duet speaks the line in its own voice, because there is no video playing.
3. One "recall a word" or "what did they mean?" from the same video, or, when a line's words are all sayable, "use it": the line said back, then a sentence of the learner's own.

- If nothing was watched lately, the session is due cards only.
- If nothing is due either, it says "You're all caught up" and offers "Back to Today".
- The end shows "done for today" and the streak. It shows no scores. Today is kept only when something was done: a card reviewed, the line said, or the challenge answered.

**Reminder:** optional, off by default. One macOS notification a day at a time the learner chooses, set in Settings.

### The streak

Any one of these keeps the day:

- finish the daily session;
- finish a checkpoint;
- watch 10 minutes with Duet that day, in total (minutes with a video playing and Duet on).

The learner gets two automatic freezes a week, so a missed day costs nothing. The mascot never looks sad about the streak.

## 4. The home base

A normal app window with a Dock icon. It opens from the Dock, from the menu bar, and when Duet launches. A left sidebar has:

| Place | Content |
|---|---|
| Today | The daily session and the streak (the default view) |
| Watching | Videos used with Duet: title, thumbnail, where the learner left off, its reading level and % understood (then and now), and the reading levels watched. A click reopens the video in the browser at that point |
| Cards | Today's My cards window, moved here: browse, search, edit, review |
| Talk | Duet without a video: voice or text practice with saved words and recent videos, on the same tutor |
| Words | Every word met, by its rung on the knowledge ladder, with a count per rung and words met and known (added later) |
| Settings | Language, level, checkpoints on/off, reminder time, shortcut, permissions. The strip's ⚙ keeps only quick toggles |

### Changes to existing screens

- **The side panel** keeps two tabs: Script and Explain. **Review moves to the home base** (Cards and the daily session). The mascot is not shown on Review.
- **Tutor and cards link:** in Explain, Duet still offers to save a card. In Cards, each card has "Practise with Duet". It opens Explain on the card's scene if the card came from a video, or Talk on the card if it did not.
- **The My cards window** becomes the home base's Cards place.

## 5. The watch log and the streak (data)

All data stays on the learner's Mac, in the existing local database. Duet never keeps audio.

| Store | Holds | Written by | Read by |
|---|---|---|---|
| videos | site and id, URL, title, language, where the learner left off, last watched, minutes watched | watcher | Watching; the 10-minute streak rule |
| lines | each line met: start time, original, translation, words. Kept for the last ~30 videos | watcher | checkpoints; the daily "say the line" |
| word events | hovered (after ~300 ms), saved, explained, missed in a checkpoint | strip, cards, Explain, checkpoints | choosing words for checkpoints |
| days | per day: minutes watched, session done, checkpoints done | all of the above | the streak (two freezes a week) |
| video words | each video's words, as met in its lines, each with how well it was known when first met there ("then"). Never pruned | watcher | each video's % and reading level |

In "Say the line", in a checkpoint and in the daily session, Duet speaks the line.

## Build order

Each piece gets its own implementation plan.

1. **Watch log and streak:** the four stores, the writers and the streak rule.
2. **Home base:** the window, the Dock icon, Cards and Review moved in, Settings, Watching.
3. **Daily session:** the session builder and the Today view.
4. **Checkpoints and the glow:** the triggers, the builder, the glow and the three challenge kinds.

The friend's onboarding and visual pass can build on the home base after piece 2.

## Related decisions (designed separately)

- **Talk-to-Duet button.**
  - The button is the mascot's outline and sits against the left side of the subtitle box. A keyboard shortcut does the same.
  - Pressing it pops the mascot up above the subtitles for a voice conversation. Small subtitles show what Duet said and what it heard, and the conversation can expand into the text chat.
  - The video pauses and plays on when the learner closes Duet.
- **Tutor page (Explain).**
  - The thinking mascot moves into the Explain tab's top bar, and the composer loses its mascot. Replies fly out of the top bar.
  - The mascot does not appear on Review.

## Backlog (not in this design)

- Recommending videos by level (scored by known words; YouTube first).
- ~~Known and unknown words (the friend's design)~~ done as the knowledge ladder; ~~comprehension scores~~ done as progress tracking (2026-10-16).
- Mascot reactions to moments.
- The end-of-video recap card.
- "Talk about it" as a checkpoint kind.

## Out of scope

- Onboarding, finding the script, and the visual style. These belong to the friend's work and only need to fit this flow.
- Automatic language detection (later).
