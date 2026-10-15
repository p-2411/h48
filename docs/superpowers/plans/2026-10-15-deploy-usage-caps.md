# Deploying usage caps (server, database, sign-in)

For the session that does the deploy. The code is on `claude/adoring-tesla-95e35n` (PR p-2411/h48#2);
the design is `docs/superpowers/specs/2026-10-13-usage-caps-design.md`; the server's own notes are
`server/README.md`.

## What the session needs (from the owner, in the environment's secrets, never in chat)

| Variable | What | Scope |
|---|---|---|
| `VERCEL_TOKEN` | Vercel access token | The team that owns `duet-waitlist` |
| `NEON_API_KEY` | Neon API key | The owner's Neon account |
| `WORKOS_API_KEY` | WorkOS secret key (`sk_…`) | Staging first, then Production |
| `WORKOS_CLIENT_ID` | WorkOS client id (`client_…`), not a secret | Same environment as the key |
| `DUET_SERVER_OPENAI_KEY` | A new OpenAI key for a project "Duet server", with a monthly budget | Only the server uses it |

The owner also decides: the Vercel plan (Pro is needed for commercial use and a per-minute cron),
and whether the API lives at `api.useduet.io`.

Never print, log or commit any of these. Pass them to CLIs through the environment, and to Vercel
with `vercel env add NAME production < <(printf %s "$VAR")`.

## Steps

1. **Check the code.** `cd server && npm ci && npm test`; `cd app && npm ci --ignore-scripts && npm test && npm run build`.
2. **Neon.** Create a project `duet-api` in `aws-us-east-1` (`POST https://console.neon.tech/api/v2/projects`
   with `Authorization: Bearer $NEON_API_KEY`). Take the pooled connection URI from the reply into a
   shell variable only (`DATABASE_URL`). Run `cd server && DATABASE_URL=… npm run migrate`.
3. **WorkOS.** With `WORKOS_API_KEY`, add the redirect URI `duet://auth/callback` and the logout URI
   `https://useduet.io` if the API allows it; if not, the owner adds them in the dashboard
   (Redirects). Email, Google and Apple sign-in are turned on in the dashboard
   (Authentication). Production needs Duet's own Google and Apple credentials.
4. **Vercel project.** `npx vercel@latest` with `--token "$VERCEL_TOKEN"`:
   - create project `duet-api`, linked to Git repo `p-2411/h48`, root directory `server`, framework
     Other, no build command; turn on skipping deploys when `server/` is unchanged;
   - function region `iad1`;
   - env (production): `OPENAI_API_KEY` (from `DUET_SERVER_OPENAI_KEY`), `DATABASE_URL`,
     `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `CRON_SECRET` (a new random 32-byte hex);
   - domain `api.useduet.io` (DNS for `useduet.io` is on Vercel if `duet-waitlist` serves it);
   - deploy from `main` once PR #2 is merged (or from the PR branch as a preview first).
   - On Pro, change the cron in `server/vercel.json` to `* * * * *`.
5. **Check the live server.** `curl -i https://api.useduet.io/v1/duet/me` → 401 `auth`. A 500 means a
   setting is missing: read the deployment's logs.
6. **App build.** The owner builds on their Mac:
   `cd app && MAIN_VITE_WORKOS_CLIENT_ID=client_… npm run build:mac`, signs in, and checks
   Settings › Your plan (Free, 0 of 2 h, 0 of 200 credits). Development runs use
   `DUET_API_URL=https://api.useduet.io/v1` and `DUET_WORKOS_CLIENT_ID=client_…` in `app/.env.local`.
7. **Stripe (later).** Product "Duet" at $15.99/month; webhook
   `https://api.useduet.io/v1/stripe/webhook` for `checkout.session.completed` and
   `customer.subscription.created|updated|deleted`; customer portal on; then the three
   `STRIPE_…` settings in Vercel.
