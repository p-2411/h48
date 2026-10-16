# Duet API (api.useduet.io)

The server between the Duet app and OpenAI. It holds the OpenAI key, checks each learner's
WorkOS sign-in, and meters their use: credits (OpenAI cost), watch hours and live voice minutes.
It stops a learner at their plan's caps. Stripe payments set the plan.

Design: `docs/superpowers/specs/2026-10-13-usage-caps-design.md`.

## Layout

| Path | What it does |
|---|---|
| `api/index.js` | The one Vercel function. `vercel.json` sends every `/v1/*` request to it. |
| `src/app.js` | The routes: a Web `Request` in, a `Response` out. |
| `src/proxy.js`, `src/rules.js` | The OpenAI routes, and what each one lets through. |
| `src/meter.js` | Hold before a call, charge after it. Each change is one SQL statement. |
| `src/live.js`, `src/watch.js` | Live voice minutes (with hang-up), and watch hours. |
| `src/billing.js` | Stripe Checkout, the portal and the webhook. |
| `src/plans.js`, `src/prices.js` | The caps by plan, and OpenAI's prices (with the date they were checked). |

## Commands

- `npm test`: every test, with PGlite (Postgres in memory) and fakes for OpenAI and Stripe. No network.
- `npm run migrate`: makes the tables in `DATABASE_URL`. Safe to run again. Every Vercel deploy runs it first (`vercel-build`), so a schema change reaches the database before the code that needs it; run it by hand only for a database Vercel doesn't deploy to.
- `npm run plan -- <email or user id> <free|paid>`: sets a plan by hand.
- `npm run dev`: the server on http://localhost:8787. It reads `server/.env.local`, which is never committed.

## Settings (Vercel → Project → Settings → Environment Variables)

| Name | Needed | What it is |
|---|---|---|
| `OPENAI_API_KEY` | yes | The OpenAI project key. Set a monthly budget on that project too. |
| `DATABASE_URL` | yes | Neon Postgres (the Neon integration sets `POSTGRES_URL`, which also works). |
| `WORKOS_CLIENT_ID` | yes | The AuthKit client id (the same one the app is built with). |
| `CRON_SECRET` | yes | Protects `/v1/duet/cron/sweep`. Vercel sends it to the cron. |
| `WORKOS_API_KEY` | no | Lets the server look up each learner's email once (for the plan script and Checkout). |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | for payments | All three, or payments stay off. |

The cron in `vercel.json` runs once a day, because that is the most the Hobby plan allows. On Pro,
set it to every minute (`* * * * *`). Then a live call whose app stops reporting is hung up within
about 2 minutes, even if no other request comes in.
