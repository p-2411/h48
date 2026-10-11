# Roofless waitlist: design spec

Date: 2026-10-10. Status: building. Research basis: `docs/research/2026-10-10-waitlist-research.md` (cited below as "brief §N").

## Goal

One job: get a visitor to leave their email. Everything on the page either explains the idea, removes a doubt, or offers the email field again. It must look modern and sleek, scroll over a parallax landscape scene, and be production ready (real storage, compliance, accessibility, performance, tests).

## Fixed decisions (from the founder)

- Name **Roofless** (working name, set in `src/config/site.ts`). Headline **"Go Solar. Without a roof."**
- Orange and white. Bright orange `#FF6A13` for art and accents. Buttons `#FF6010` with **white 19px bold** labels (3.03:1, WCAG AA large text). Navy `#1D2433` text.
- Full-width frosted-glass header. One rounded email bar with the button inside it; no visible "Email" heading; placeholder is an example address.
- Extra details (home type, postcode) collected in a modal after the email is saved.
- Custom angled-triangle cursor (built, `src/components/cursor/`).
- No panel-grid visual on this page.
- Stack: Next.js 16.4 App Router (Cache Components on), React 19.3, Tailwind 4.3, Motion 14.1.0, Zod 4, Neon Postgres (connected later; local file store in dev).

## Page structure (top to bottom)

All copy below is final unless marked. Words to avoid (brief §5.4) are banned everywhere: invest, returns, earn, income, profit, guaranteed, safe, secure, free power, save $, reserve, pre-order, subscribe, etc.

1. **Header** (`SiteHeader`, client): full-width glass bar, height 64px. Left: logo mark + "Roofless". Centre/right: anchors "How it works", "FAQ" (hidden < 720px). Right: ink button "Join the waitlist" which scrolls to `#join` and focuses the hero email input. Hides on scroll down, shows on scroll up (300ms). `html { scroll-padding-top: 80px }`.

2. **Hero** (`#join`), dawn. Centred, generous negative space, min-height ~92svh so the scene shows around it. The email bar must be visible on a 360×640 screen without scrolling.
   - Pill: "Coming soon" (glass pill, orange dot). Required by compliance (brief §5.2.1).
   - H1: "Go Solar. Without a roof." (wide Archivo, ~clamp(40px, 6vw, 84px), weight 650, tight leading.)
   - Subhead (max 34em, 18–20px, slate): "We're building shared solar farms where you can own panels. The power they make is sold to the grid, and that money goes toward your power bill. Made for renters and apartments."
   - `JoinForm` (hero variant).

3. **The gap** (stats), still dawn → morning. Two big statements, each with its own source link (brief §6 verified):
   - "Nearly 1 in 3 Australian households rent." — ABS Census 2021 (https://www.abs.gov.au/statistics/people/housing/housing-census/2021)
   - "Only about 1 in 9 rental homes has rooftop solar, compared with nearly half of homes owned outright." — Energy Consumers Australia, Dec 2025 (https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties)
   - Heading: "Rooftop solar needs a roof. Most renters don't have one."

4. **How it works** (`#how`), midday. Heading "How it works". Three numbered steps (a real sequence):
   1. "Own panels on a shared farm" — "Choose how many panels you want on a solar farm we're building in regional Australia."
   2. "The farm sells the power" — "The electricity your panels make is sold to the grid."
   3. "The money goes toward your bill" — "We put that money toward your power bill. If it's more than your bill, we plan to pay you the difference. If it's less, you pay the rest."
   - Step 3's surplus and shortfall sentences stay together at the same size (brief §5.1 balance).
   - Then `JoinForm` (inline variant).

5. **Why it's different**, early afternoon. Heading "Built for people without a roof". Four short points (no cards; a 2×2 grid of text with small line icons):
   - "No roof needed" — "Your panels are on the farm, not your house. Rent, live in an apartment, or move often."
   - "Keep your retailer" — "We're designing Roofless to work alongside the energy company you already use."
   - "Moves when you move" — "Your panels aren't tied to an address. The plan: update your details and carry on."
   - "Free to join" — "No payment details and no deposit. Leave the list any time."

6. **Vision**, afternoon. Large statement: "Can't buy the house? Own a piece of the power station." Body: "Energy is what everything runs on: homes, transport, and the computers doing more of our work. We think more people should own a part of it, not just the people with a roof." Then `JoinForm` (inline).

7. **Who's building this**. Heading "Who's building this". Body: "Roofless started at the H48 hackathon in October 2026. We're a small Australian team, and we're talking to people like you before we build. Questions? Email us." + contact email link. Team names/photos render from `site.team` when filled (empty for now; the founder must add real people, never placeholders).

8. **FAQ** (`#faq`), late afternoon. Native `<details>` accordions, 8 items:
   - How much will it cost? — "We haven't set prices yet. Joining the waitlist is free and needs no payment details. People on the list will hear about pricing first."
   - Do I need my own roof or home? — "No. Your panels sit on a shared solar farm, so you can join if you rent, live in an apartment or move often."
   - What if my panels make less than my bill? — "You pay the rest of your bill, as you do now. If they make more than your bill, we plan to pay you the difference."
   - Do I have to switch energy retailer? — "We're designing Roofless to work alongside your current retailer. We'll confirm exactly how before launch."
   - What happens when I move house? — "Your panels aren't tied to your address. The plan is that you update your address and the money goes toward your new bill."
   - Where will the farm be? — "We're choosing a site in regional Australia now. People on the waitlist will hear first."
   - How is this different from the Solar Sharer Offer? — "The Solar Sharer Offer is a retailer plan with free power at midday. It needs a smart meter and a plan switch, and many apartment buildings can't use it. With Roofless, you own panels, and the power they make all day goes toward your bill."
   - What if Roofless shuts down? — "We'll publish exactly how ownership is held, and what happens in that case, before anyone pays anything."
   - What do you do with my details? — "We use your email to tell you about the launch. If you give us your home type and postcode, we use them to plan where to build. We never sell the list. Read our Privacy Policy."
   - Then `JoinForm` (inline).

9. **Final CTA**, golden hour. Heading "Be first on the farm." Line: "Join the waitlist. It's free, and you can leave any time." `JoinForm` (hero variant, centred).

10. **Footer** (`SiteFooter`): logo + one line; links Privacy Policy, contact email, privacy email; Sources (both stats); "Illustration. Farm site to be announced."; disclaimer: "Roofless is a concept in development{ by {legalName}, ABN {abn}}. It is not available yet. Nothing on this site is an offer of, or invitation to apply for, any product, including any financial product, and nothing here is financial advice. We are not accepting money or applications. Features describe what we plan to build and may change." Legal name/ABN come from `site` config and are omitted until set.

11. **Mobile sticky CTA** (`StickyCta`, < 720px only): slim glass bar "Join the waitlist" button, appears once the hero form is out of view, hides when any `JoinForm` is visible or any input is focused, and after sign-up becomes "You're on the list ✓ · Share". IntersectionObserver only.

## Sign-up flow and components

`src/components/signup/` (client components):

- `SignupProvider` — React context wrapping the page. State: `{ status: 'idle' | 'joined', email, referralCode, detailsToken, detailsStatus: 'pending' | 'saved' | 'skipped', modalOpen }`. Persists `email`/`referralCode`/`joined` in `sessionStorage` (try/catch) so a refresh keeps the joined state. Exposes `useSignup()`.
- `JoinForm({ variant: 'hero' | 'inline', id?: string, inputId?: string })` — `<form action={formAction}>` with `useActionState(joinWaitlist)`. Works without JS (progressive enhancement: the server action returns state; without JS the page re-renders with the result — acceptable minimal fallback).
  - Visually hidden `<label>` "Your email". Input: `type=email inputMode=email autoComplete=email autoCapitalize=off autoCorrect=off spellCheck=false enterKeyHint=go`, 16px+, placeholder `you@example.com`, `name=email`.
  - Hidden inputs: honeypot `company_website` (off-screen, `tabIndex=-1`, `autoComplete=off`, `aria-hidden`), and `ref`, `utm_source`, `utm_medium`, `utm_campaign`, `landing_path`, `referrer` filled on the client from `location`/`document.referrer` at mount.
  - Bar: rounded-full glass pill (`glass` utility), height 64px, button inside on ≥ 480px; on narrow screens the button drops below the input at full width (still inside the same rounded container is fine if it fits; otherwise stacked, 52px).
  - Validation: on blur (only if non-empty) and on submit; never disable the button. Error text below the bar, `role=alert`, specific (from server or client zod). Typo suggestion: "Did you mean sam@gmail.com?" as a button that fills the field (`suggestEmail()` in `src/lib/waitlist/suggest.ts`; domains incl. gmail.com, outlook.com, hotmail.com, icloud.com, yahoo.com, bigpond.com, bigpond.net.au, optusnet.com.au, live.com.au, outlook.com.au, yahoo.com.au).
  - Button states: idle "Join the waitlist"; pending shows spinner only after 350ms ("Joining…"); success shows "You're in ✓" for ~700ms, then opens the modal (if `detailsToken`), else shows the joined state.
  - Under the bar (hero variant shows both lines; inline shows only the consent line):
    - Trust line (14px, ink 80%): "Free to join. No payment details."
    - Consent line (12.5–13px, slate): "By joining, you agree that Roofless can email you about our launch, early access and short surveys, until 12 months after launch. Unsubscribe any time. Some of our providers are in the US. **Privacy Policy**" (link `/privacy`).
  - Joined state (replaces the bar in every JoinForm): "You're on the list ✓" + "We'll email {email}." + "Not you? Fix it" (resets local state to idle) + `ShareButton`.
- `DetailsModal` — accessible dialog rendered once by the provider (native `<dialog>` with `showModal()` gives focus trap + Esc; return focus to the last JoinForm input on close). Desktop: centred card max 480px. Mobile (< 640px): bottom sheet. Content:
  - Title "You're on the list ✓". Line: "2 quick questions to help us plan farms near you. Both optional."
  - Progress: "Email ✓ → Your home → Done" (step 1 filled).
  - "Your home (optional)": three large tappable radio cards — "I rent", "I own", "Apartment". Selecting one moves focus to postcode.
  - "Postcode (optional)": `type=text inputMode=numeric autoComplete=postal-code pattern="[0-9]{4}" maxLength=4 enterKeyHint=done`; helper "So we can tell you when a farm opens near you, and see where demand is."
  - Notice: "We use your home type and postcode only for research and launch planning. Privacy Policy".
  - Buttons: primary "Save" (submits `saveDetails`), text button "Skip". Close (✕) = Skip. Esc = Skip.
  - Server requires both fields when saving (current schema). If the visitor fills only one, Save asks for the other; Skip always completes.
  - After save/skip: modal closes, every JoinForm shows the joined state.
- `ShareButton` — `navigator.share({ title, url })` when available; otherwise a small popover/menu with "Copy link" (clipboard, shows "Link copied"), WhatsApp (`https://wa.me/?text=<url>`), Email (`mailto:?subject=Roofless&body=<url>`). URL = `${site.url}/?ref={referralCode}` (no email or personal data in URLs). No pre-written promo text, no rewards.
- `StickyCta` — see page structure §11.

Server: `src/lib/waitlist/actions.ts` (`joinWaitlist`, `saveDetails`), already built and tested. Add `landing_path`, `referrer` and a salted IP hash to the stored consent record (migration `0002`).

## Scene (parallax background)

`src/components/scene/Scene.tsx` (client island, `aria-hidden`), rendered once in `page.tsx` behind all content; art in `public/scene/*.svg` produced by a deterministic generator script `scripts/generate-scene.mjs` (seeded, re-runnable; output committed). Brief §3.

- Container: `position: fixed; inset: 0; height: 100lvh; pointer-events: none; z-index: 0; overflow: hidden`. Content sits above (`relative z-10`).
- One shared viewBox for every layer (e.g. `0 0 1600 1000`), `preserveAspectRatio="xMidYMax slice"` so the horizon stays anchored at the bottom on any aspect ratio.
- Layers, back to front, each a `motion.div data-parallax` wrapping an `<img>` (or a CSS gradient div for skies):
  1. Sky — three full-bleed gradient layers, opacity crossfade by scroll: dawn (pale peach → pink-cream → white), day (white → very pale warm blue-white), golden hour (deep `#FF8A3D` → `#FFD3B8` → cream). Keep the page "orange and white": skies stay warm and light; never saturated blue.
  2. Sun — orange disc `#FF6A13` with a soft baked halo ring (no filters), rises from near the horizon (dawn) to high (midday), lowers to the horizon with a bigger, deeper disc at golden hour.
  3. Far ridge — pale, hazy (low contrast, baked haze).
  4. Hills — red-earth/ochre tinted, softly lit, with sparse eucalypts.
  5. Solar farm — rows of navy panels following the hill contour, thin light edges, one panel highlighted orange with a small tag "Panel A-0142 · yours" (tag is SVG text, decorative; the page has `aria-hidden` on the scene). Also a transmission line/poles running from the farm toward the city.
  6. City skyline — Australian apartment blocks and terraces with balconies, a Hills Hoist, **no rooftop panels**; light warm-white/peach facades with navy window grids. Window lights fade in (opacity) near the end.
  7. Foreground — eucalypt silhouettes/grass at the edges, darkest, moves fastest.
  8. Scrim — a white gradient behind content areas whose opacity rises where text needs contrast (top hero area stays clear).
- Motion: page-level `useScroll()`; per layer `useTransform(scrollYProgress, [0, 1], ['translate3d(0,0,0)', 'translate3d(0,Npx...)'])` using **percent of the layer** or `vh` in the transform string (not in useScroll offsets). Camera rises: nearer layers move **down** more (foreground travels most, sky barely), revealing the farm behind the city by "How it works". Depth speeds roughly 2/6/12/22/38/60/100% of max travel. Skies/lights use opacity only. No `useSpring`, no `style={{ y }}`, no filters, ≤ 8 moving layers, `will-change: transform` only on moving layers.
- Mobile (< 720px): drop the far ridge and foreground; halve travel.
- Reduced motion: (1) CSS `@media (prefers-reduced-motion: reduce) { [data-parallax] { transform: none !important } }`; (2) `useReducedMotion()` → render a static midday composition with no bound transforms.
- Each SVG < ~50 kB after optimisation (strip metadata, round coordinates to 1 decimal). The hero H1 stays the LCP element; scene images use `loading="eager"` + `decoding="async"`, only the skyline gets `fetchPriority="high"` if needed.
- Legibility: hero text sits on the clear dawn sky above the skyline; later sections use frosted panels (`glass` with stronger white, `bg-white/75`) so text is always ≥ 4.5:1 over any part of the scene.

## Content sections styling

- Container max-width 1200px, 20px gutters; sections 120–160px vertical spacing on desktop, 88px on mobile.
- Section text blocks sit in frosted panels (`rounded-[28px]`, white 72–80%, blur 18px) over the scene, left-aligned, max line length ~65ch.
- Type scale (Archivo): 13 / 15 / 17 / 20 / 28 / 40 / clamp(40–84) px. Headings `font-wide` weight 600–650; body weight 400. No all-caps labels, no accented single word in headlines, no `→` in button text.
- Reveals: below-the-fold blocks fade/translate 20px via CSS `animation-timeline: view()` inside `@supports` + `prefers-reduced-motion: no-preference`. Never on hero elements.

## Compliance checklist (brief §5)

- "Coming soon" next to H1. Consent + privacy link under every email form. Collection notice in the modal. Fields optional with Skip. Privacy Policy page `/privacy` (APP 1.4 content, last-updated date, overseas providers: Vercel (US), Neon (US company; data in Sydney region), retention, access/correction/deletion within 30 days, complaints → OAIC, contact). Footer disclaimer + sources + illustration label. No money words, no figures. Consent record stored per sign-up (email, timestamp, privacy version, landing path/referrer, UTMs, hashed IP). `vercel.json` `regions: ["syd1"]`. No pixels; Vercel Web Analytics only (cookieless). No emails sent yet (no welcome email until a legal sender identity exists).

## Infrastructure

- `vercel.json`: `{ "regions": ["syd1"] }`. Vercel Root Directory: `waitlist`.
- Env: `DATABASE_URL` (Neon, region aws-ap-southeast-2), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `IP_HASH_SALT` (optional; falls back to a per-deploy constant), optional `NEXT_PUBLIC_LEGAL_NAME`, `NEXT_PUBLIC_ABN`.
- `pnpm db:migrate` applies `db/migrations/*.sql`.
- Metadata: title/description/OG/Twitter, `opengraph-image.tsx` (1200×630, white + orange sun + headline), `icon.svg`, `apple-icon.png` (or `.tsx`), `robots.ts`, `sitemap.ts`, `manifest.ts`.

## Testing

- Unit (Vitest): schema, store, actions, rate limit (done); suggest; SignupProvider/JoinForm/DetailsModal/ShareButton behaviour; cursor (done).
- E2E (Playwright, Chromium + WebKit, plus a `reducedMotion: 'reduce'` project): hero form visible at 360×640; join → modal → save → joined state everywhere; skip path; invalid email message; typo suggestion; header button focuses the input; no console errors; axe scan of the page and the open modal (no serious/critical violations).
- Manual/visual: screenshots at 1440, 1024, 390 widths at scroll 0 / 35% / 70% / 100%; reduced-motion screenshot; Lighthouse (performance ≥ 90 mobile, accessibility 100).

## Open items for the founder (do not block the build)

Legal name + ABN; real team names/photos; final domain; Neon/Vercel connection; legal review of the footer and "your panels" wording before ads or press; publish a retention period (default in the policy: 12 months after launch or 24 months after sign-up if we haven't launched).
