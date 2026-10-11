# Duet application

Duet is the product implementation on the `ex` branch. It is an Electron, React, and TypeScript application with a local SQLite backend and the pinned `ts-fsrs` scheduler.

## Included product flows

- Freeze and select a recent Japanese caption moment.
- Request a concise contextual explanation with nuance, alternatives, limitations, and provenance.
- Continue into an attached push-to-talk tutor session without losing the selected expression.
- Capture pronunciation attempts and abstain when no validated acoustic provider is configured.
- Create Understand or Use it cards with explicit learning targets.
- Search, filter, inspect, pause, resume, and delete locally stored cards.
- Review due cards with Again, Hard, Good, and Easy through `ts-fsrs` 5.4.2.
- Persist atomic before/after scheduler snapshots and undo the latest compatible review.
- Configure desired retention, new-card allowance, reading aids, explanation balance, and text size.
- Export and restore a versioned JSON backup containing cards, scheduler state, review history, and settings.

The UI follows the visual language of [useduet.io](https://useduet.io): a black canvas, oversized restrained typography, glass navigation, thin borders, and limited blue, indigo, and orange light.

## Install and run

```powershell
npm install
npm run dev
```

The SQLite database is created as `duet.sqlite` inside Electron's per-user application-data directory. It is not written into the repository.

## Language service boundary

The app works locally without credentials. In that state, explanation and tutor features use the reviewed Japanese demonstration fixture, while pronunciation assessment records the attempt and explicitly abstains from unsupported scoring.

To connect a hosted language and acoustic service, set these environment variables before starting Electron:

```powershell
$env:DUET_AI_ENDPOINT = 'https://your-service.example/v1/duet'
$env:DUET_AI_API_KEY = 'your-development-key'
npm run dev
```

The endpoint receives a versioned JSON request with `kind` set to `explain`, `tutor`, or `pronunciation`. Provider credentials remain in the main process and are never exposed to the renderer. Caption text and metadata are explicitly marked as untrusted language content.

## Verify

```powershell
npm run typecheck
npm run lint
npm run build
```

Package targets remain available as `build:win`, `build:mac`, and `build:linux`.

## Current integration boundary

The app contains the full local card, review, settings, backup, explanation, tutor, and pronunciation-provider architecture. The Learn view currently uses a labelled, human-reviewed demonstration fixture. Live YouTube caption capture remains a separate platform-adapter task and must not be represented as completed until it is proven on the declared supported video set.
