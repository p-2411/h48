# Usage caps, piece A: accounts, the proxy and credits

Status: draft for the owner's review, 2026-10-13. The choices below come from the questions asked in
chat that day. Items marked **Open** are not decided yet.

## Intent

Duet must cap each user's cost. The caps are on a server, not in the app: a changed app must not
be able to go past a cap. Today the app calls OpenAI from the Electron main process with the
owner's key from `app/.env.local`. There are no accounts and no backend.

The full work has four pieces. Each piece gets its own spec and build. Duet can go public only when
A, B and C are done, because after A the app never holds the OpenAI key again.

| Piece | What it adds | Needs |
|---|---|---|
| **A (this spec)** | Server on Vercel + Neon. WorkOS sign-in in the app. Device id. Every OpenAI call goes through the server, which meters credits and stops at the cap. Plans are set by hand. | — |
| B | Hours counted on the server clock: watch sessions with heartbeats; lines and hearing work only inside an open session; the hours cap. | A |
| C | Usage in the app: hours and credits left, reset times, an Upgrade button. | A, B |
| D | Payments: Stripe Checkout and portal; a webhook sets the plan to Paid. | A |

Success for piece A:
- The packaged app holds no OpenAI key and never calls api.openai.com itself.
- A signed-in free user who has spent $2 of OpenAI cost this month gets no more AI until the month
  resets. A changed app cannot get past this.
- Many calls sent at the same moment cannot take a user more than one call's cost past the cap.
- At the cap, Duet stops all AI and says why and when it resets. Card reviews still work.
- The OpenAI key is only in the server's environment. It is never printed, logged or committed.

## 1. The caps

1 credit = $0.01 of real OpenAI cost. The server keeps money as whole micro-dollars (1 credit =
10,000 µ$), so no rounding builds up.

| Plan | Credits | Hours (piece B) | Resets |
|---|---|---|---|
| Free | 200 a month ($2), tutor and all included | 2 h a week | Credits: the 1st of each month, 00:00 UTC. Hours: Monday 00:00 UTC |
| Paid ($15.99/month) | 600 a month ($6) | 40 h a month | The 1st of each month, 00:00 UTC, until piece D moves it to the billing date |

- The caps live in one table in the server code (`server/src/plans.js`), not in the database, so a
  change is a reviewed commit.
- A new account is Free. The owner sets Paid by hand with a script (`npm run plan -- <email> paid`)
  until piece D.
- When a user hits a cap, all AI stops for that user: lines, hearing, Explain, the tutor, live voice,
  daily rounds and checkpoint judging. Card reviews need no AI and still work.

## 2. Architecture

```
 Duet (Electron main)                     api.useduet.io (Vercel, new project)          OpenAI
 ┌─────────────────────────┐  HTTPS       ┌──────────────────────────────────┐  HTTPS   ┌────────┐
 │ 6 OpenAI clients        │ ───────────▶ │ 1 check the WorkOS token (JWKS)  │ ───────▶ │  API   │
 │  baseURL = api.useduet  │ Bearer token │ 2 check the rules for the route  │ ◀─────── │        │
 │  fetch adds token +     │ X-Duet-Device│ 3 hold an estimate (atomic)      │  usage   └────────┘
 │  device id              │ ◀─────────── │ 4 forward with the real key      │
 │ WorkOS AuthKit (PKCE)   │  reply, or   │ 5 charge the real cost, free the │
 └─────────────────────────┘  402 at cap  │   hold                           │
                                          └──────────────┬───────────────────┘
                                                         │ Neon Postgres (its own database)
                                                         ▼ users · devices · meters · charges
```

- **Where:** a new Vercel project in the owner's account, with its own Neon database, in a new
  folder `server/` in this repo. It is apart from the waitlist project, so a push of the site does
  not change the proxy. The domain is `api.useduet.io` (**Open:** the owner confirms the name).
- **Shape: pass-through with rules.** The app keeps its prompts. Its OpenAI clients point at
  `https://api.useduet.io/v1` and send the user's token instead of a key. The server lets through
  only the endpoints and models Duet uses (section 4), holds a cost estimate first, forwards the
  call with the real key, then charges the real cost from the reply's `usage`.
- **Code style:** plain ES-module Vercel functions like `waitlist/api/join.js`, with the
  `@neondatabase/serverless` driver. Tests are plain assert scripts run by `npm test` in `server/`.
  The tests use PGlite (Postgres in WebAssembly, in memory), so the SQL that holds and charges runs
  against real Postgres rules without a server.

## 3. Accounts and devices

**Sign-in: WorkOS AuthKit** (the hosted page gives email, Google and Apple).

- The app uses `@workos/authkit-electron`: the system browser, PKCE, and the `duet://` deep link back
  to the app. Tokens stay in the main process, encrypted with Electron `safeStorage`. The renderer
  never sees a token.
- **Open:** the exact SDK calls. The first build step reads the SDK's README and records them here.
- The server checks each request's access token against WorkOS's JWKS with `jose`: the signature,
  the issuer, the client id and the expiry. The token's `sub` is the user id. A user row is made on
  the first request. WorkOS makes sure the email is verified before it gives a token.
- In development (`is.dev`), when `app/.env.local` has `OPENAI_API_KEY`, the app calls OpenAI
  directly with no sign-in, as today. A packaged build never reads `.env.local` (this is already so,
  `src/main/index.ts`), so it always uses the server. `DUET_API_URL` points a dev build at a local
  server.

**One free tier per Mac (light guard).**

- The app sends `X-Duet-Device`: a SHA-256 of the machine's hardware id (macOS `IOPlatformUUID`;
  Windows `MachineGuid`; Linux `/etc/machine-id`) with a fixed Duet salt. It does not change when
  Duet is removed and installed again. The raw hardware id never leaves the Mac.
- The server links each user to the devices it has seen. On a device that is already linked to 2
  other Free accounts, a new Free account gets 0 credits. It sees "Free Duet is limited to two
  accounts on one computer." Paid accounts are never blocked by this.
- A changed app can send a false device id. This guard stops casual abuse only, as agreed. The
  worst case is $2 a month for each extra account.

## 4. The proxy

**Routes** (anything else gets 404):

| Route | Used by | Rules |
|---|---|---|
| `POST /v1/responses` | lines, Explain, tutor text, quiz, scenes, translate, romanise | model `gpt-6-luna`; `max_output_tokens` at most 2,000 (set to 2,000 when missing); `stream` false; `store` false; only `function` tools; no `background` |
| `POST /v1/chat/completions` | listen, pronunciation coach | model `gpt-audio-1.5`; `max_completion_tokens` at most 1,000; `n` = 1; `stream` false |
| `POST /v1/audio/transcriptions` | hearing | model `gpt-4o-mini-transcribe`; file at most 4 MB (Vercel's body limit is 4.5 MB; Duet's pieces are 8 s or less) |
| `POST /v1/audio/speech` | daily and checkpoint rounds | model `gpt-4o-mini-tts`; input at most 1,000 characters |
| live voice session create (path as the SDK uses it) | live tutor | model `gpt-live-1`; SDP offer at most 100 KB; see section 6 |
| `GET /v1/duet/me` | the app | plan, credits used and cap, reset time, blocked or not |

- The server sets `safety_identifier` to a hash of the user id, so OpenAI can tell users apart if
  one user misuses the key.
- Model names, endpoints and limits are in one rules table (`server/src/rules.js`). A model the
  table does not name is refused with 400, so a changed app cannot use a dearer model.
- A reply from OpenAI goes back to the app as it came (status, body, the content type), so the
  app's SDK sees the same replies and errors as today.

**Prices.** `server/src/prices.js` has the price of each model: input, cached input, cache writes,
output, audio input, audio output, and per minute for live voice. It records the date the prices
were checked on openai.com. Cost per call:

- Responses: `input_tokens` less cached at the input price; `cached_tokens` at the cached price;
  `cache_write_tokens` at the cache-write price; `output_tokens` (with reasoning) at the output price.
- Chat with audio: text and audio tokens from `prompt_tokens_details` and
  `completion_tokens_details`, each at its own price.
- Transcription: the `usage` in the reply (audio and text tokens). If it has none, the audio's
  length at the per-minute price.
- Speech: the input text tokens and the output audio. The reply is audio with no usage, so the
  server works out the audio length from the MP3's size and bit rate. This is an estimate, and is
  marked so in the charge.

## 5. The meter: hold, then charge

Tables:

| Table | Rows |
|---|---|
| `users` | `id` (WorkOS `sub`), `email`, `plan` (`free`, `paid`), `created_at` |
| `devices` | `device_id`, `user_id`, `first_seen` (one row for each pair) |
| `meters` | `user_id`, `period` (e.g. `2026-10`), `spent_micro`, `held_micro` |
| `charges` | `id`, `user_id`, `period`, `route`, `model`, `held_micro`, `cost_micro`, `status` (`held`, `charged`, `freed`), `usage` (jsonb), `created_at` |

Each call:

1. **Estimate.** A generous guess of the call's cost: its input size (UTF-8 bytes ÷ 2 as a token
   count, or the audio length) at the input price, plus its output limit at the output price.
2. **Hold.** One atomic statement:
   `update meters set held_micro = held_micro + $est where user_id = $u and period = $p and
   spent_micro + held_micro + $est <= $cap returning ...`.
   No row back means the cap is reached: the reply is **402** with
   `{ error: { code: 'usage_cap', cap: 'credits', resets_at } }`. A `charges` row in `held` records
   the hold.
3. **Forward** to OpenAI with the real key.
4. **Charge.** From the reply's usage: `spent_micro += cost`, `held_micro -= est`, and the charge
   row goes to `charged` with its usage. When OpenAI fails, the hold is freed and nothing is charged.
5. **Lost holds.** If the function stops between 2 and 4, the hold stays. On the user's next call,
   holds older than 15 minutes are charged at their estimate. This fails closed: the user may lose
   a little, the owner never pays unmetered.

Because the hold and the check are one statement, calls sent at the same moment cannot go past the
cap together. The output is clamped, so the real cost is almost always under the estimate. When it
is more, the real cost is still charged, so a user can end past the cap by at most that one
difference.

The owner also sets a monthly budget on the OpenAI project as a last guard if the server has a bug.

## 6. Live voice

Live voice is WebRTC. The server can do the session create (the SDP exchange), but then the audio
goes straight between the app and OpenAI. It costs $0.05 for each minute it is open. Duet ends a
call after 60 s with nobody speaking (`timing.ts`).

- **Start:** the session create goes through the proxy like any other call. The server holds 5
  minutes ($0.25) and records the session id and start time. A user can have one open call at a
  time; a new call ends the meter of the old one.
- **Each minute:** the renderer already gets `session.usage.updated`. Each minute, main sends the
  seconds to `POST /v1/duet/live/<id>/minute`. The server holds the next minute. When the hold fails
  (the cap), the reply says `stop`, and the app ends the call with "You've used this month's
  credits".
- **End:** `POST /v1/duet/live/<id>/end` with the seconds. The server charges the seconds, but never
  less than the time from the start to the last minute call. A call with no end is charged at the
  time up to its last minute call plus one minute, when the user's next call comes.
- **What a changed app can do:** skip the minute calls and keep the audio going. It pays 5 minutes
  and can talk until OpenAI ends the session. **Open (first build step):** look in the OpenAI SDK
  for a way for the server to end a live session or read its usage (a hang-up call or a server-side
  control connection to the same session). If one exists, the server ends calls at the cap and
  piece A uses it. If not, this gap stays, and the limit of one open call caps the loss at one
  session.

## 7. The app

- **One OpenAI client factory** (`src/main/ai/client.ts`) replaces the 6 `new OpenAI(...)` in
  `tutor/live.ts`, `ai/providers/openai.ts` and `ai/voice/openai.ts`. In dev with a key, it gives a
  direct client. Otherwise it gives a client with `baseURL` set to the server and a `fetch` that adds
  a fresh access token and the device id to each request (tokens expire, so the token is not fixed
  when the client is made).
- **Signed out:** the home window shows a "Sign in to Duet" panel and the strip says "Sign in to
  Duet to see lines". Sign-in opens the browser. Settings get "Signed in as …" and Sign out.
- **At the cap:** a new `ModelError` kind `quota`. The SDK gives an `APIError` with status 402 and
  code `usage_cap`. The lines session stops and does not try again (unlike `rate_limit`). The strip
  says "You've used this month's free credits. They come back on 1 November." The tutor and Explain
  show the same sentence through `say()` with a new code `USAGE_LIMIT_REACHED`. The app asks
  `/v1/duet/me` again on the next video, and after the reset time.
- **Anthropic:** the Anthropic provider stays for development only. Signed-in builds use OpenAI
  through the server.

## 8. Out of scope for A

The hours cap and watch sessions (B), the usage screen and Upgrade button (C, apart from the cap
message above), payments (D), and Anthropic through the server.

## 9. What the owner does (Claude does not sign in to services)

1. Make a WorkOS account and an AuthKit app: the redirect `duet://auth/callback`, email + Google +
   Apple turned on. Give the client id (not secret) for the app's config.
2. Make the Vercel project from `server/` and a Neon database for it. Set `OPENAI_API_KEY`,
   `DATABASE_URL`, `WORKOS_CLIENT_ID` and `DEVICE_SALT` in Vercel. Point `api.useduet.io` at it.
3. Set a monthly budget on the OpenAI project.

## 10. Build order

Each step starts with a failing test, then the code, then the full `npm test` (server and app) and
`npm run build` in `app/`. No commit or push until the owner asks.

1. **Spikes, no code kept:** read the `@workos/authkit-electron` README and the OpenAI SDK's live
   API (the create path; is there a server hang-up or usage read?). Record the answers in this spec.
2. **Server skeleton:** `server/` with `package.json`, `vercel.json`, the test runner and PGlite.
3. **Plans, prices, rules:** caps by plan and period; the cost of a call from a usage object for
   each route; the rules table refuses wrong models, streams and limits.
4. **Meter:** hold, charge, free, lost holds, the period roll-over; many holds at once never pass
   the cap (tested with parallel holds on PGlite).
5. **Auth and devices:** token check with a test key set; user made on first call; the two-Free-
   accounts-per-device rule.
6. **Proxy routes:** each route against a fake OpenAI (a local HTTP server): forwards, charges from
   usage, 402 at the cap, frees the hold when OpenAI fails, never logs the key or the token.
7. **Live voice meter:** start hold, minute holds, `stop` at the cap, end, lost-end charge, one open
   call.
8. **`/v1/duet/me`** and the `plan` script.
9. **App client factory:** dev direct vs proxied; the `fetch` adds the token and device id; all 6
   clients use it.
10. **App device id and account:** hashed hardware id; WorkOS sign-in, sign-out, token kept with
    `safeStorage`; signed-out states in home and strip.
11. **App quota handling:** the `quota` kind; lines stop without retry; the sentences in strip,
    Explain and the tutor; live voice minute calls and `stop`.
12. **End to end, by hand with the owner:** the app against a local server with a real sign-in
    (the owner signs in), then against the deployed server.
