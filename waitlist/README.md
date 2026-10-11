# Roofless waitlist

The waitlist site for **Roofless** (working name): shared solar farms where people without a roof can own panels. The page has one job: get a visitor to leave their email. It scrolls over a parallax landscape, saves sign-ups to Postgres, and asks two optional questions (home type and postcode) after the email is saved.

- Stack: Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript (strict), Tailwind CSS 4.3, Motion 14.1, Zod 4, Neon Postgres, Vercel Web Analytics.
- Spec: [`docs/superpowers/specs/2026-10-10-roofless-waitlist-design.md`](docs/superpowers/specs/2026-10-10-roofless-waitlist-design.md). Copy, layout and compliance rules live there.
- Research brief: [`docs/research/2026-10-10-waitlist-research.md`](docs/research/2026-10-10-waitlist-research.md). Conversion playbook, Australian compliance (§5), statistics (§6) and infrastructure (§7).
- Brand, legal and statistic values: [`src/config/site.ts`](src/config/site.ts). Change them there, never in components.

> This Next.js version has breaking changes. Read the matching guide in `node_modules/next/dist/docs/` before you use a Next API (see `AGENTS.md`).

## Local development

```bash
pnpm i
pnpm dev
```

Open http://localhost:3000. Without `DATABASE_URL`, sign-ups go to `.data/waitlist.json` (git-ignored). Delete that file to start again. A production build never uses the file store: without a database, the form shows "We couldn't save that just now" and the server logs `StoreNotConfiguredError`.

To override a setting locally, copy `.env.example` to `.env.local` and edit it.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts the dev server on port 3000. |
| `pnpm build` | Makes a production build. |
| `pnpm start` | Serves the production build. |
| `pnpm typecheck` | Runs `tsc --noEmit`. |
| `pnpm lint` | Runs ESLint. |
| `pnpm test` | Runs the unit tests (Vitest, jsdom). |
| `pnpm test:watch` | Runs the unit tests in watch mode. |
| `pnpm e2e` | Runs the Playwright tests (see [End-to-end tests](#end-to-end-tests)). |
| `pnpm db:migrate` | Applies `db/migrations/*.sql` to `DATABASE_URL`. Every migration is idempotent, so you can run it again. |

## Environment

All variables are listed with a one-line note in [`.env.example`](.env.example).

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Neon Postgres connection string (Sydney region). |
| `NEXT_PUBLIC_SITE_URL` | Production | Public URL, no trailing slash. Used for canonical links, Open Graph, `robots.txt`, the sitemap and share links. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Production | Contact address in the footer and the privacy policy. |
| `NEXT_PUBLIC_PRIVACY_EMAIL` | Production | Address for privacy requests and complaints. Falls back to the contact address. |
| `NEXT_PUBLIC_LEGAL_NAME` | When it exists | Legal entity name. The footer and the privacy policy show it only when it is set. |
| `NEXT_PUBLIC_ABN` | When it exists | ABN, shown after the legal name. |
| `IP_HASH_SALT` | Production | Secret salt for the one-way IP hash in each consent record. Keep it stable across deploys. |

`NEXT_PUBLIC_*` values are built into the page, so redeploy after you change them.

## Connect the database (Neon via the Vercel Marketplace)

1. In the Vercel project, open **Storage** (or **Integrations > Marketplace**), choose **Neon**, and create a database on the Free plan.
2. Set the region to **AWS Asia Pacific (Sydney), `aws-ap-southeast-2`**. You cannot change a Neon project's region later.
3. Connect it to the project for Production, Preview and Development. Vercel adds `DATABASE_URL` (and related variables) for you.
4. Pull the variables and create the tables:

   ```bash
   vercel env pull .env.local
   pnpm db:migrate
   ```

   The script reads `DATABASE_URL` from `.env.local` or from your shell.

Neon's Free plan scales to zero after 5 minutes idle, so the first sign-up after a quiet period is a little slower.

## Deploy on Vercel

1. Import the repository in Vercel and set **Root Directory** to `waitlist`. Vercel detects Next.js and pnpm.
2. Use Node.js 24.x (Project Settings > Build and Deployment).
3. Functions run in Sydney: [`vercel.json`](vercel.json) sets `"regions": ["syd1"]`. Do this before the first real sign-up. The Vercel default is Washington, D.C.
4. Add the environment variables above for Production (and Preview if you test sign-ups there). Set `IP_HASH_SALT` to a long random value, for example `openssl rand -hex 32`.
5. Turn on **Web Analytics** in the project. It is cookieless, and it is the only analytics on the site. Do not add ad pixels without updating the privacy policy first.
6. Add one **Vercel WAF rate-limit rule** (Firewall > Configure > New rule). The Hobby plan allows one:
   - If: Request Method equals `POST` and Request Path equals `/`.
   - Then: Rate limit, Fixed window, 60 seconds, 10 requests, keyed by IP.
   - Action: start with **Log**. Change it to **Deny** (429) once the logs look right.

   The app also has an in-memory limiter, but it counts per warm instance only. The WAF rule is the global limit.
7. Do not deploy during a live demo. Without Skew Protection (Pro plan), an open tab can fail with "Failed to find Server Action" until it is refreshed.

The Open Graph image (`src/app/opengraph-image.tsx`) downloads the Archivo font from Google Fonts once, during the build. If the build has no network access, the image still builds, but with a plain font.

## Export sign-ups

Run this in the Neon SQL editor (or `psql "$DATABASE_URL"`). It leaves out anyone on the suppression list.

```sql
SELECT
  s.email,
  s.home_type,
  s.postcode,
  s.utm_source,
  s.utm_medium,
  s.utm_campaign,
  s.landing_path,
  s.referrer,
  s.referral_code,
  s.referred_by,
  s.privacy_version,
  s.consented_at AT TIME ZONE 'Australia/Sydney' AS consented_at_sydney,
  s.details_at AT TIME ZONE 'Australia/Sydney' AS details_at_sydney
FROM waitlist_signups AS s
WHERE NOT EXISTS (
  SELECT 1 FROM waitlist_suppressions AS x
  WHERE x.email_hash = encode(sha256(convert_to(s.email, 'UTF8')), 'hex')
)
ORDER BY s.created_at;
```

In `psql`, wrap it as `\copy (SELECT ...) TO 'signups.csv' WITH CSV HEADER` to save a CSV. Treat exports as personal information: keep them off shared drives, and delete them when you are done.

When someone asks to be removed, delete their row and keep only the hash (the same hash the query above checks):

```sql
INSERT INTO waitlist_suppressions (email_hash)
VALUES (encode(sha256(convert_to(lower('person@example.com'), 'UTF8')), 'hex'))
ON CONFLICT DO NOTHING;
DELETE FROM waitlist_signups WHERE email = lower('person@example.com');
```

Counts by source (conversion rate = sign-ups ÷ Vercel page views for the same source):

```sql
SELECT coalesce(utm_source, '(none)') AS source, count(*) AS signups
FROM waitlist_signups
GROUP BY 1
ORDER BY 2 DESC;
```

## End-to-end tests

```bash
pnpm exec playwright install chromium webkit   # once
pnpm e2e
```

Playwright builds the app and serves it on port 3100 (`pnpm build && pnpm start`). It runs desktop Chromium, mobile WebKit (iPhone 13) and Chromium with reduced motion. The tests cover the hero form on a 360×640 screen, the header button, validation messages, the typo suggestion, the join, skip and save paths, console errors, axe scans (page, open dialog, privacy policy) and the privacy page.

A production build saves sign-ups only to Postgres, so the join tests need a database:

- **With a database:** put `DATABASE_URL` for a **Neon development branch** (never the live list) in `.env.local` or your shell. Test sign-ups use `e2e+…@example.com` addresses.
- **Without a database:** run `E2E_SERVER=dev pnpm e2e`. This uses `pnpm dev`, which saves to `.data/waitlist.json`.

The HTML report is in `playwright-report/`.

## Compliance checklist before launch

See brief §5 for the reasons. This list is not legal advice.

- [ ] **Legal name and ABN.** Set `NEXT_PUBLIC_LEGAL_NAME` and `NEXT_PUBLIC_ABN`. The footer disclaimer and the privacy policy pick them up automatically.
- [ ] **Lawyer review.** An Australian financial services lawyer reviews the footer disclaimer, the "your panels" wording and the privacy policy before any paid ads or press.
- [ ] **Retention.** Confirm the published period (12 months after launch, or 24 months after sign-up if we haven't launched). Put a reminder in the calendar to delete or de-identify on time.
- [ ] **Privacy inbox.** Set `NEXT_PUBLIC_PRIVACY_EMAIL` to a real, monitored address. Name the person who answers access, correction, deletion and complaint requests within 30 days.
- [ ] **Region.** `vercel.json` has `syd1`, and the Neon project is in `aws-ap-southeast-2`.
- [ ] **Provider terms.** Accept the Vercel and Neon data processing terms (overseas disclosure, APP 8).
- [ ] **Secrets.** `IP_HASH_SALT` is set in production. Only the people who need it can open the database.
- [ ] **No emails yet.** Send nothing until there is a legal sender identity, a verified sending domain and one-click unsubscribe. Add the email provider to the privacy policy first.
- [ ] **No pixels.** Vercel Web Analytics only, unless the privacy policy is updated first.
- [ ] **Team.** Add real names to `site.team` in `src/config/site.ts`, or leave it empty. Never use placeholders.
- [ ] **Breach plan.** Write a one-page plan: who decides, how to contain it, and when to tell people and the OAIC.

When the privacy notice text changes, bump `privacyVersion` in `src/config/site.ts`. Each sign-up stores the version it agreed to, and the privacy policy's "Last updated" date comes from the same value.
