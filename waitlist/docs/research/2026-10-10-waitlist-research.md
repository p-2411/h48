# Roofless waitlist: research brief

- **Date:** 10 Oct 2026. **Demo:** Monday 12 Oct 2026 (H48).
- **Goal of the page:** get visitors to sign up. Email first, then an optional step for home type and postcode.
- **Status:** for team review. This is not legal advice.
- **How to read it:** every fact links to its source. A second agent re-checked the compliance, stats and stack tracks. Where that check corrected a claim, this brief uses the corrected version. Refuted or unsupported claims are left out, or listed under "Do NOT use".

---

## 1. Summary

1. **Build for phones first. Keep the words plain.** 83% of landing-page visits come from mobile. Copy at a Year 5 to 7 reading level converted at 11.1%, against 5.3% for professional-level copy ([Unbounce 2024](https://unbounce.com/conversion-benchmark-report/)).
2. **Ask for the email only. Save it before you ask anything else.** The number of fields causes more friction than the number of steps ([Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)). After the email is saved, open an optional 2-question step ([NN/g](https://www.nngroup.com/articles/modal-nonmodal-dialog/)).
3. **The headline is fine, but it is not unique.** SolarCloud, Haystacks and Arcadia already use nearly the same line ([SolarCloud](https://www.solarcloud.com.au/), [Haystacks](https://haystacks.solargarden.org.au/), [Arcadia](https://www.arcadia.com/community-solar)). The subhead and the first section must show what is different.
4. **We can own four gaps:** signup is free with no payment, ownership is told as "own part of the power station", "your panel" is shown visually, and the scene is Australian. SolarCloud takes a 10% deposit ([SolarCloud](https://www.solarcloud.com.au/)). Ripple members lost access to about £10.4m that the platform held ([Solar Power Portal](https://www.solarpowerportal.co.uk/energy-policy/ripple-energy-customers-could-lose-investment-to-creditors)).
5. **Keep parallax to the background.** Animate only transform and opacity. Keep native scroll. Show a static scene under reduced motion. Do not scrolljack ([NN/g parallax](https://www.nngroup.com/articles/parallax-usability/), [NN/g scrolljacking](https://www.nngroup.com/articles/scrolljacking-101/)).
6. **Use the Motion 14.1.0 that is already installed. Do not add GSAP, Lenis or three.js.** three.js alone is about 185 kB gzip ([bundlephobia](https://bundlephobia.com/)). Lenis caps Safari at 60fps ([Lenis README](https://github.com/darkroomengineering/lenis)).
7. **The brand orange fails contrast with white text.** White on #FF6A13 is 2.87:1 ([W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). Use dark text on the orange, or white text on a deeper orange.
8. **The main legal risk is money words, not the form.** The planned product may be a managed investment scheme ([Corporations Act s9, s601ED](https://www.legislation.gov.au/C2004A00818/latest/text)). So: no "invest", "returns" or "earn", no numbers, and no deposits ([ASIC RG 234](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)). Get advice from a lawyer before running paid ads or talking to press.
9. **The Spam Act applies whatever the business size.** Every email must identify the sender and have a one-click unsubscribe. We must keep proof of consent ([ACMA](https://www.acma.gov.au/avoid-sending-spam)).
10. **Keep the scaffold stack:** Next 16.4.0, React 19.3.0, Motion 14.1.0, Tailwind 4.3.3, Neon Postgres in Sydney, Vercel functions in syd1. Upgrade Next on 14 Oct for the announced security release ([Next.js](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026)). Do not deploy during the demo ([Vercel Skew Protection](https://vercel.com/docs/skew-protection)).

---

## 2. Conversion playbook (highest impact first)

### 2.1 Give the page one job
- Remove links that compete with the signup. When Yuppiechef removed its navigation bar, signups doubled from 3% to 6% ([VWO](https://vwo.com/blog/a-b-testing-case-study-navigation-menu/)).
- The header has the logo, one "Join the waitlist" button and at most 2 in-page anchors (How it works, FAQ). No social or outbound links.
- The header button scrolls to the hero form and focuses its input.

### 2.2 Make the first screen sell, within 10 seconds
- The first 10 seconds decide whether a visitor stays ([NN/g](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/)).
- 57% of viewing time is above the fold, and 74% is within the first two screens ([NN/g](https://www.nngroup.com/articles/scrolling-and-attention/)).
- On a 360×640 viewport, the email field and button must show without scrolling. The scene must never push them down.
- Draft hero (all claims are descriptive and say "planned" where needed; see §5):

  > **Coming soon · Join the waitlist**
  > # Go Solar. Without a roof.
  > We're building shared solar farms where you can own panels. The power they make is sold to the grid, and that money goes toward your power bill. Made for renters and apartments.
  > `[ Your email ]` `[ Join the waitlist ]`
  > Free to join · No payment details · Unsubscribe anytime · Privacy

### 2.3 Use one email field everywhere
- Every CTA uses the same component: one email input and one button ([Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)).
- All copies share one signed-up state. After signup, every CTA changes to "You're on the list ✓ · Share".

### 2.4 Save first, then show the optional step as progress already made
- A card with 2 of 10 stamps already filled was completed by 34% of people. An empty card that needed the same work was completed by 19% ([Nunes & Drèze summary](https://siliconcanals.com/t-car-wash-loyalty-cards-endowed-progress/)).
- People who agree to a small request are more likely to agree to a bigger one ([Freedman & Fraser 1966](https://pubmed.ncbi.nlm.nih.gov/5969145/)). Later research finds the effect is real but small.
- Open the modal only after a successful submit. Never open it on page load, on a timer or on exit intent ([NN/g](https://www.nngroup.com/articles/modal-nonmodal-dialog/)).
- Modal title: "You're on the list ✓". Line: "2 quick questions to help us plan farms near you (optional)". Progress: **Email ✓ → Your home → Done**.
- On mobile, show it as a bottom sheet. Support Esc, a visible close button and "Skip". Use an accessible dialog with a focus trap.

### 2.5 Modal fields
- Home type: large tappable cards, not a dropdown. A dropdown is a weak choice for fewer than about 5 options ([Baymard](https://baymard.com/research-articles/drop-down-usability)). A tap on a card can move straight to the postcode.
- Postcode markup: `<input type="text" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{4}" maxlength="4" enterkeyhint="done">`. Do not use `type="number"`, because scroll and trackpad gestures change its value ([GOV.UK](https://technology.blog.gov.uk/2020/02/24/why-the-gov-uk-design-system-team-changed-the-input-type-for-numbers/)).
- Say why you ask. A required personal field with no explanation makes some users quit or enter fake data ([Baymard](https://baymard.com/research-articles/explain-phone-number-field)). Helper text: "So we can tell you when a farm opens near you, and see where demand is."
- Mark both questions "Optional".

### 2.6 Email input details
- Markup: `type="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go"` ([Baymard](https://baymard.com/blog/mobile-touch-keyboards)).
- Font size must be at least 16px so iOS does not zoom in. Do not block pinch-zoom ([Baymard](https://baymard.com/blog/mobile-touch-keyboards)).
- Give the field a real `<label>` ("Your email"). Use the placeholder only as an example ("you@example.com") ([NN/g](https://www.nngroup.com/articles/form-design-placeholders/)).

### 2.7 Validation and typo help
- Validate when the user leaves the field or submits, never while they are typing. Never disable the submit button ([Baymard](https://baymard.com/blog/inline-form-validation)).
- Make errors specific: "Add the part after @, for example name@gmail.com."
- Offer a one-tap fix for domain typos ("Did you mean …@gmail.com?"). Never change the address automatically. Kicksend reported that this halved its confirmation bounces. That result comes from one company ([mailcheck](https://www.npmjs.com/package/mailcheck)).
- Add these AU domains to the suggestion list: bigpond.com, optusnet.com.au, outlook.com, icloud.com, hotmail.com.

### 2.8 Buttons
- Use a solid fill with a little depth (shadow or inner highlight). Flat or ghost designs cost 22% more time and 25% more fixations ([NN/g](https://nngroup.com/articles/flat-ui-less-attention-cause-uncertainty)).
- Make the button about 48px tall and full width under the input on mobile. WCAG 2.5.8 sets a 24×24px minimum.
- Define every state ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/)):
  - Hover: darken, 150–200ms.
  - Focus: a visible outline, not colour alone.
  - Pressed: press-in, 100–150ms.
  - Loading: add a spinner only after about 300–400ms.
  - Success: the button changes to "You're in ✓" before the modal opens.
- **Contrast** ([W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); ratios computed for this brief):
  | Pair | Ratio | Passes |
  |---|---|---|
  | White on #FF6A13 | 2.87:1 | Nothing |
  | White on #FF6010 (scaffold `--color-sun-cta`) | 3.03:1 | Large text only (≥18.66px bold) |
  | Ink #1D2433 on #FF6010 | 5.13:1 | AA, all sizes |
  | #111 on #FF6A13 | 6.58:1 | AA, all sizes |
  | White on #C2410C | 5.18:1 | AA, all sizes |
  
  For the current token, either use ink text on the button, or guarantee the white label is ≥19px bold in every state and at every width. Never use #FF6A13 for small text or links on white.

### 2.9 CTA label
- Ship "Join the waitlist". No published test compares it with "Get early access" ([Unbounce/Aagaard](https://unbounce.com/conversion-rate-optimization/how-to-write-a-call-to-action/)).
- Do not use "Reserve my panel" or "Secure your panel". Nothing can be reserved, and these labels imply a purchase (see §5).
- Traffic before Monday is too low for a valid A/B test. Test labels after the demo.

### 2.10 Trust, when you have no customers yet
- Show a real organisation and real people: names, photos, a contact email, the ABN, and fresh content ([Stanford credibility guidelines](https://credibility.stanford.edu/guidelines)).
- Put a privacy line under the button. In one test, signups rose from 18.1% to 27.1% with a privacy statement ([NextAfter](https://www.nextafter.com/?p=12850)).
- Hide any signup counter until the number is real and something you are proud of. Low counts work as negative social proof ([VWO Taloon](https://vwo.com/blog/removing-social-sharing-buttons-from-ecommerce-product-page-increase-conversions/)). When you do show it, round down ("300+").
- Do not show regulator, industry-body or press logos that we do not have.

### 2.11 Repeat the CTA. Keep sticky bars polite
- Put the same form after How it works, after Why own, after Who's building this, after the FAQ and in the footer.
- On mobile, show a slim bottom CTA bar once the hero form leaves the screen. Hide it while any input is focused or any page form is visible. Use IntersectionObserver for this ([Smashing](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/)).
- Hide the header on scroll-down and show it on scroll-up (300–400ms). Set `scroll-padding-top` so focused fields are never hidden (WCAG 2.4.11) ([Smashing](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/)).
- Do not put the only CTA in a top corner. Grip changes often ([Hoober](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)).

### 2.12 Explain the idea with a picture near the top
- When the concept is new, an explainer can move a waitlist a lot. Dropbox's demo video took its list from 5,000 to 75,000 overnight ([TechCrunch](https://techcrunch.com/2011/10/19/dropbox-minimal-viable-product)).
- Use 3 steps: **Own panels → The farm sells power to the grid → The money goes toward your bill.** Put the surplus line and the shortfall line together in the same block (§5).
- The scene must show the idea. Users skip decorative images and look at images that carry information ([NN/g](https://www.nngroup.com/articles/photos-as-web-content/)).

### 2.13 FAQ
- Write 6–8 grouped accordions that answer known objections. Put a form directly after them ([NN/g](https://www.nngroup.com/articles/faqs-deliver-value/)).
- Questions to answer without inventing numbers:
  - What does it cost? (Pricing is not set. It is free to join, and there is no payment now.)
  - Who are you? Is this real?
  - What if my panels make less than my bill? (You pay the difference.)
  - What if I move?
  - Do I need to switch retailer?
  - Where is the farm?
  - How is this different from the Solar Sharer Offer?
  - What happens to my panels if Roofless shuts down? ("We'll publish exactly how ownership is held before anyone pays.")
  - What do you do with my data?

### 2.14 Success state and sharing
- Show the address back to the user ("We'll email sam@… · Not you? Fix it"), say what happens next, and give a share button.
- Use `navigator.share()` where it exists. Fall back to "Copy link", plus WhatsApp and email links ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)).
- **For the demo, share the URL only.** Give no rewards, show no "move up the list" offer and use no pre-written promo text. ACMA found that McDonald's "caused" messages just by providing a send-to-friend facility ([Brightlaw](https://www.brightlaw.com.au/refer-a-friend-marketing-legal-issues/)). ACMA's expectations also say not to use refer-a-friend arrangements ([ACMA SoE](https://www.acma.gov.au/publications/2024-07/guide/consumer-consent-expectations-businesses-conducting-telemarketing-and-e-marketing)).
- Do not show a numbered queue. Huge or meaningless positions frustrate users, which is why Mailbox dropped its queue ([Mactrast](https://www.mactrast.com/2013/04/mailbox-app-drops-reservation-system-now-open-to-all-gmail-users/)). Harry's tiered referral page is the template for later, after legal review ([Tim Ferriss](https://tim.blog/2014/07/21/harrys-prelaunchr-email/)).

### 2.15 Speed
- Every 0.1s of mobile speed gained improved lead-gen bounce by 8.3% (a Google-commissioned study) ([web.dev / Deloitte](https://web.dev/case-studies/milliseconds-make-millions)).
- Budgets at p75: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 ([web.dev](https://web.dev/articles/lcp)).
- Server-render the hero text and form so they work before the art loads.

### 2.16 No fake urgency or scarcity
- No countdowns, no "only N left", no inflated counters, and no confirm-shaming dismiss links. Misleading urgency is already a risk under the ACL. A specific ban on unfair trading practices starts on 1 July 2027 ([Allens](https://www.allens.com.au/insights-news/insights/2026/07/australias-new-unfair-trading-practices-regime-what-businesses-need-to-know/)).

### 2.17 Measure by source
- Tag every channel with UTMs. Give the demo slide its own QR code and UTM.
- Funnel: view → email focus → submit success → modal answered or skipped → share click → referred signup.
- Vendor targets are directional only: about 25–45% for warm traffic, 10–20% for cold organic and 3–10% for paid ([LaunchList](https://getlaunchlist.com/glossary/waitlist-conversion-rate)).
- Use single opt-in and count "confirmed" as a separate metric. In GetResponse data, single opt-in converted 1.28% of visitors and double opt-in converted 0.33% ([GetResponse](https://www.getresponse.com/blog/single-opt-in-vs-double-opt-in)).

### 2.18 No visible CAPTCHA
- Use invisible checks, a honeypot field, a rate limit and duplicate handling that still shows success ([Vercel BotID](https://vercel.com/docs/botid/form-submissions)). See §7 for the setup.

---

## 3. Scroll storytelling and parallax

### 3.1 The story
- **Time of day carries the scroll:** dawn at the hero, midday at How it works, golden hour at the final CTA.
- **The scene shows the idea:**
  1. Apartment blocks and terraces with no panels.
  2. A grid line.
  3. A solar farm on the horizon.
  4. One highlighted panel with a tag ("Panel #A-0142 · yours").
  5. Energy flowing back to the homes.
- **Use Australian cues:** eucalypts, red earth, balconies, a Hills Hoist. Avoid a smiling sun, green cartoon hills, stock panel photos and a dark globe. Competitors already use those ([Solstice](https://solstice.us/), [SolarCloud](https://www.solarcloud.com.au/)).
- **Label the art.** Add "Illustration. Farm site to be announced." The ACCC warns against images that give a false impression ([ACCC](https://www.accc.gov.au/media-release/accc-releases-eight-principles-to-guide-businesses%E2%80%99-environmental-claims)).

### 3.2 Architecture
- `app/page.tsx` stays a Server Component. It renders the H1, all copy, the FAQ and the email `<form action={serverAction}>`. Server Action forms submit before JS loads ([Next.js](https://nextjs.org/docs/app/guides/server-actions)).
- Add only small client islands: `<Scene/>` (aria-hidden), `<SiteHeader/>`, `<JoinModal/>` and `<Cursor/>`.
- Google does not scroll or interact with the page. Nothing important may depend on scroll to appear ([Google Search Central](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading)).
- Real sites follow the same pattern: Stripe keeps its H1 as text and marks its canvas aria-hidden ([Stripe](https://stripe.com/)), and Apple builds motion on top of no-JS and reduced-motion states ([Apple](https://www.apple.com/airpods-pro/)).

### 3.3 Scene build
- Use one `position: fixed; inset: 0; height: 100lvh; pointer-events: none` container with `aria-hidden="true"`.
- Use 6–8 layers, from back to front:
  1. Sky: 2–3 stacked gradients for dawn, day and golden hour, crossfaded with opacity.
  2. Sun.
  3. Far ridge.
  4. Hills.
  5. Solar farm.
  6. Skyline (its window lights fade in near the final CTA).
  7. Foreground.
- Make depth speeds non-linear, like Firewatch (8 layers at speeds 2 to 100). Add a scrim layer that fades in so the text stays readable ([Firewatch](https://www.firewatchgame.com/)).
- Export each layer as its own SVG with an identical viewBox. Run SVGO and keep each file under about 50 kB. Serve them as `<img>`, not inline. Next serves `.svg` unoptimized automatically ([Next.js Image](https://nextjs.org/docs/app/api-reference/components/image)).
- `priority` is deprecated in Next 16. Use `preload`, or `fetchPriority="high"`, on at most one image ([Next.js Image](https://nextjs.org/docs/app/api-reference/components/image)).
- Let the H1 be the LCP element. Bare `<svg>` and `<canvas>` are not LCP candidates ([web.dev LCP](https://web.dev/articles/lcp)).
- Use no SVG filters and no CSS blur on moving layers. Bake haze into the art ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
- Size the scene with `lvh` or `svh`, never `100vh` or `dvh`. Then layers do not jump when mobile toolbars show or hide ([web.dev](https://web.dev/blog/viewport-units)).
- On mobile, drop the 2 least important layers and halve the travel distance.

### 3.4 Motion code pattern
- Page-level: `useScroll()` with no offset. Hero-only: `useScroll({ target, offset: ['start start','end start'] })` ([Motion useScroll](https://motion.dev/docs/react-use-scroll)).
- Write each layer like this: `const transform = useTransform(scrollYProgress, [0,1], ['translate3d(0,0,0)','translate3d(0,-18vh,0)'])`. Bind it as `<motion.div data-parallax style={{ transform }} />`.
- **Do not** use `style={{ y }}`, `clamp: false`, `useSpring`, chained `useTransform`, px or vh offsets in `useScroll`, or `<motion.g>` inside one big SVG.
- **Conflict, resolved.** The scroll track found that Motion 14.1.0 runs scroll-linked values on native ScrollTimeline or ViewTimeline under the conditions above. The stack check found changelog entries (13.4.7, 13.5.0) that move offset tracking to the main thread ([Motion CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md)). The installed source settles it. `framer-motion/dist/es/value/use-scroll.mjs` still has `canAccelerateScroll`, which accelerates when there is no offset (ScrollTimeline) or when the offset maps to a ViewTimeline range. `motion-dom` accelerates only `opacity`, `clipPath`, `filter`, `transform` and `backgroundColor`. **So:** write it the accelerated way, but budget as if it runs on the main thread. Verify in Chrome and Safari 26 with `document.getAnimations()`.
- Firefox stable (157) does not ship scroll-driven animations, and Motion falls back to JS there ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Experimental_features)). Firefox has 2.8% of AU traffic. Safari has 32.4%, so test on a real iPhone ([StatCounter](https://gs.statcounter.com/browser-market-share/all/australia)).
- Use `whileInView` or IntersectionObserver for reveals. CSS scroll-triggered animations are Chrome-only ([Chrome](https://developer.chrome.com/blog/scroll-triggered-animations)).

### 3.5 Section reveals (safe without JS)
- Put CSS reveals under `@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { … } }`. Use a 16–24px translateY plus opacity.
- **Never** give the hero H1, subhead, email field or button an initial `opacity: 0`. Opacity-0 elements are not LCP candidates, and with Motion SSR they stay hidden until hydration ([web.dev LCP](https://web.dev/articles/lcp), [web.dev CLS](https://web.dev/articles/cls)).

### 3.6 Performance rules
- Use 8 or fewer moving layers. Put `will-change: transform` only on those layers ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
- Animate only transform and opacity. Never animate gradients, box-shadow, blur or filters on scroll ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
- Use zero scroll event listeners. Detect the hero form leaving the screen with IntersectionObserver.
- Reserve space for every layer, because a real layout shift during scroll counts toward CLS ([web.dev CLS](https://web.dev/articles/cls)).
- Keep total client JS for the route under about 100 kB gzip. LazyMotion with `domAnimation` and `m` brings Motion's initial cost down to about 4.6 kB ([Motion](https://motion.dev/docs/react-use-scroll)).
- Keep the header blur small: `rgba(255,255,255,.72)` with `blur(12px) saturate(1.4)`. Add a solid fallback ([caniuse](https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency)).
- QA:
  - DevTools at 4× CPU throttle, with the FPS meter, paint flashing and the Layers panel.
  - A real iPhone in Safari, a mid-range Android, and Firefox stable.

### 3.7 Accessibility rules
- **Reduced motion, in three layers.** WCAG 2.3.3 lists parallax as non-essential motion ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).
  1. Global CSS: `@media (prefers-reduced-motion: reduce) { [data-parallax] { transform: none !important; animation: none !important; } }`. Author `!important` rules beat animations in the cascade ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Cascade)). Applying this to WAAPI animations follows from the spec but was not tested.
  2. In `<Scene/>`, if `useReducedMotion()` is true, bind no transforms and render a static scene. Motion's `reducedMotion="user"` does **not** stop scroll-linked style values ([Motion a11y](https://motion.dev/docs/react-accessibility)). The hook reads the setting once, at mount.
  3. Optional: a footer "Reduce motion" toggle that sets `data-motion="reduce"` on `<html>`.
- No important text inside moving layers. No interactive elements inside transformed layers.
- A sticky header must not hide focus. Use `html { scroll-padding-top: var(--header-h) }` (WCAG 2.4.11) ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
- **Custom triangle cursor:**
  - Show it only under `(hover: hover) and (pointer: fine)`. Use the native cursor under reduced motion and in forced colours.
  - It must change visibly over CTAs (fill or scale), because the cursor change is a core hover signal ([NN/g](https://www.nngroup.com/articles/button-states-communicate-interaction/)).
  - Text inputs keep the native I-beam.
  - Make it `aria-hidden` and `pointer-events: none`.
  - The scaffold's hook already gates on fine pointer and forced colours. **Add reduced motion.**
- No Lenis, no scroll-snap, no horizontal sections, no pinned sections taller than about 150–200vh ([NN/g](https://www.nngroup.com/articles/scrolljacking-101/)).

---

## 4. Competitor messaging and the gaps we can own

| Who | Headline and CTA | Model | Friction | Weakness we can use |
|---|---|---|---|---|
| **SolarCloud** (Sydney) | "Own solar. No roof required." · "Buy solar now" ([site](https://www.solarcloud.com.au/)) | Buy panels hosted on commercial rooftops "around the world". Credits on any AU bill. An ASIC-registered scheme. | Purchase with a 10% deposit | Its own calculator shows $20–$80 a year in savings. Its panels are offshore. A testimonial admits it "sounded too good to be true" ([site](https://www.solarcloud.com.au/)) |
| **Haystacks** (NSW) | "Sunny roof not required." Now sold out ([site](https://haystacks.solargarden.org.au/)) | Co-op units, bill credits through one retailer | $4,200 per plot and a retailer switch ([SolarQuotes](https://www.solarquotes.com.au/blog/solar-garden-expands-mb2644/)) | Its first retail partner, Enova, went into administration. It ended with about 149–175 plot holders against a target of 333 ([SolarQuotes](https://www.solarquotes.com.au/blog/solar-garden-expands-mb2644/), [CPA](https://cpagency.org.au/project/haystacks-solar-garden/)) |
| **Allume SolShare** | "Unlock solar for your apartment" ([site](https://allumeenergy.com/en-au/)) | Shared rooftop solar on a building | The strata decides, so a renter cannot act alone | The benefit stays with the building |
| **Hepburn Energy** (VIC) | Climate and community, then "Subscribe" ([site](https://www.hepburnenergy.coop/membership/)) | Co-op shares | Shares cannot be sold on a market | No direct link to your bill |
| **Ripple** (UK) | "Part-own a wind farm" · Own / Power / Save ([Eco Experts](https://www.theecoexperts.co.uk/solar-panels/ripple-energy-investing)) | Co-op shares sized to how much power you use | £25 reservation fee | The platform failed in March 2025. Operating co-ops kept their assets, but about £10.4m held before construction was not refunded ([SPP](https://www.solarpowerportal.co.uk/energy-policy/ripple-energy-customers-could-lose-investment-to-creditors), [Holdfast](https://www.holdfastprojects.com/ripple-update)) |
| **Perch / Solstice / SunShare / Arcadia** (US) | "Lower your electricity bills with community solar" ([Perch](https://perchenergy.com/community-solar/how-it-works)) | A subscription for a discount. You own nothing. | ZIP, then a utility account, then payment | The subscription is cancelled if you move outside the utility area ([Perch](https://perchenergy.com/community-solar/how-it-works)) |
| **Solar Sharer Offer** (a government tariff, not a competitor) | 3 free midday hours ([Energy Made Easy](https://www.energymadeeasy.gov.au/hot-topics/solar-sharer-offer-what-you-need-to-know)) | An opt-in retailer plan. Needs a smart meter. Excludes embedded networks. Capped at 24 kWh a day. | You have to switch plans and move usage to midday | It is a tariff window, not something you own. Many apartment blocks are excluded |

### 4.1 Gaps we can own
- **Free, with no payment.** "Free to join. No payment details. Leave any time." Every competitor asks for more up front ([Perch](https://www.perchenergy.com/), [SolarCloud](https://www.solarcloud.com.au/)).
- **Ownership as owning part of the power station.** Competitors talk about savings (Perch, Solstice, SolarCloud), climate (Ripple, Hepburn) or community (Haystacks). Brand line: "Can't buy the house? Own a piece of the power station." Keep it descriptive, not financial advice (§5).
- **A concrete, visible "your panel".** This beats SolarCloud's abstract globe and Solstice's cartoon sun.
- **Australian farm scale.** SolarCloud's panels are "around the world" ([SolarCloud](https://www.solarcloud.com.au/)). Say "planned" until a site exists.
- **Plain answers to the category's objections:** "too good to be true", forced retailer switches, moving house, and "what if you go bust".

### 4.2 Do not claim as unique
- "Works with any retailer" and "moves with you". SolarCloud already says both ([SolarCloud](https://www.solarcloud.com.au/)). Keep them only as **planned** features (§5).
- "No roof" by itself. That line is saturated ([Arcadia](https://www.arcadia.com/community-solar), [Haystacks](https://haystacks.solargarden.org.au/)).

### 4.3 Visual difference
- Orange is common in this category: Solstice is orange-red, SunShare is orange, SolarCloud and Haystacks use amber CTAs ([Solstice](https://solstice.us/), [SunShare](https://mysunshare.com/)).
- Use the orange as a sharp accent on a mostly white, premium layout: frosted glass, large editorial type and a non-cartoon illustrated scene.

---

## 5. Australian compliance

> Not legal advice. Have an Australian financial services lawyer review the page before paid ads or press. The ASIC Innovation Hub gives free informal guidance: innovationhub@asic.gov.au ([ASIC](https://www.asic.gov.au/for-business-and-companies/innovation-hub/enhanced-regulatory-sandbox-ers)).

### 5.1 Why money words matter
- The planned product may be a **managed investment scheme**. People would contribute money, Roofless would run the panels and sell the power, and members would have no day-to-day control ([Corporations Act s9](https://www.legislation.gov.au/C2004A00818/latest/text)).
- If it is a scheme, assume an AFS licence and registration from the **first** retail member. s601ED(1)(b) applies when the promoter is in the business of promoting schemes ([Corporations Act](https://www.legislation.gov.au/C2004A00818/latest/text)). The verification corrected the earlier claim that registration starts after 20 members.
- **s1018A(2)** already limits advertising of a *proposed* financial product that is "reasonably likely" to reach retail clients. Breach is an offence ([s1018A](https://www.legislation.gov.au/C2004A00818/2025-12-19/2025-12-19/text/original/epub/OEBPS/document_5/document_5.html)).
- **Footer tension:** adding the PDS/TMD statements in effect says a financial product is likely. Leaving them out while the page builds interest risks an offence. For Monday, keep the page neutral and descriptive. Let a lawyer choose between the footer and a non-financial structure.
- Opinions that steer people toward the product ("a smart move", "beats a term deposit", "build wealth") can count as general advice ([ASIC INFO 269](https://www.asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/discussing-financial-products-and-services-online)). Neutral descriptions are lower risk.
- Any statement about the future (savings, bills covered) is taken to be misleading unless we have reasonable grounds. We have no product numbers, so we have no grounds ([RG 234.109–110](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)).
- **Balance:** show the downside next to the upside with "sufficient prominence": the same size, in the same block, visible at first view ([RG 234.17–18, 234.29](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)). A headline must not mislead on its own ([RG 234.34–35](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)).
- Never mention raising money for Roofless itself (shares, SAFEs, "own a piece of Roofless") on the page or in emails. s734 strict liability applies ([ASIC](https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-178mr-asic-proposes-improved-pre-ipo-advertising-flexibility-and-global-alignment/)).
- Take no money, deposits, "founding member" payments or binding commitments.

### 5.2 Required page elements
1. **"Coming soon"** or "Join the waitlist" next to the headline, so the page does not suggest the product exists now.
2. **A consent line under every email form.** It must be visible, with no pre-ticked box and nothing bundled ([ACMA](https://www.acma.gov.au/avoid-sending-spam), [ACMA SoE](https://www.acma.gov.au/publications/2024-07/guide/consumer-consent-expectations-businesses-conducting-telemarketing-and-e-marketing)). These are ACMA's better-practice expectations, not separate rules in the Act, but breaking them puts consent at risk.
3. **A collection notice at or before collection** (APP 5). A short notice with a prominent link to the full policy is allowed ([OAIC APP 5](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-5-app-5-notification-of-the-collection-of-personal-information)).
4. **The modal:** both fields marked "Optional", a "Skip" that still completes the signup, and one line on purpose. Ask for nothing else (no name, phone or address).
5. **The footer:**
   - The legal name and ABN, or a founder name and ABN.
   - A contact email and a privacy@ address.
   - A Privacy Policy link.
   - A "Sources" block for every statistic.
   - "Illustration. Farm site to be announced."
   - A disclaimer (draft in §5.3).
6. **A Privacy Policy page**, in plain English with a "last updated" date. APP 1.4 lists what it must contain:
   - What we collect, and how we collect and hold it.
   - Why we collect it.
   - Who we share it with.
   - Overseas recipients and their countries.
   - How long we keep it.
   - How to access, correct or delete it.
   - How to complain (to us within 30 days, then to the OAIC).
   - Our contact details.
   
   The OAIC can now fine businesses for policy failures ([OAIC](https://www.oaic.gov.au/about-the-OAIC/our-regulatory-approach/privacy-regulatory-action-policy/infringement-notices)).
7. **Every email**, including the welcome email:
   - The sender's legal name (or founder name and ABN).
   - Contact details that stay valid for at least 30 days.
   - A one-click unsubscribe that needs no login, works for at least 30 days and is honoured within 5 working days ([ACMA](https://www.acma.gov.au/avoid-sending-spam), [ACMA fact sheet](https://www.acma.gov.au/sites/default/files/2024-05/Fact%20sheet%20-%20email%20and%20SMS%20unsubscribe%20rules.pdf)).
   
   Lululemon paid $702,900 because its "service" emails carried promo links and had no unsubscribe ([ACMA](https://www.acma.gov.au/articles/2026-04/latitude-finance-pays-396m-more-spam-breaches)).

### 5.3 Draft wording (use the [Legal name] placeholder until an entity exists)

**Under the email button (short, layered):**
> By joining, you agree that [Legal name] can email you about Roofless: launch news, early access and short surveys, until 12 months after launch or until you unsubscribe. No spam. Unsubscribe anytime in one click. Some of our service providers are based in the United States. [Privacy Policy]

**In the modal:**
> Optional. This helps us decide where to build first. We use your home type and postcode only for research and launch planning. [Privacy Policy]

**Footer disclaimer (needs legal sign-off):**
> Roofless is a concept in development by [Legal name], ABN [ ]. It is not available yet. Nothing on this site is an offer of, or invitation to apply for, any product, including any financial product, and nothing here is financial advice. We are not accepting money or applications. Features describe what we plan to build and may change.

Hold the s1018A(2) PDS/TMD sentence until the lawyer decides (§5.1).

**Mechanism copy (balanced):**
> The plan: your panels' power is sold to the grid, and that money goes toward your power bill. If it makes more than your bill, we plan to pay you the difference. If it makes less, you pay the rest.

### 5.4 Words to avoid and words to use

| Avoid | Why |
|---|---|
| invest, investment, investor, returns, ROI, yield, dividend, earn, earnings, income, passive income, profit | Financial product signals and possible general advice ([RG 234](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf), [INFO 269](https://www.asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/discussing-financial-products-and-services-online)) |
| guaranteed, risk-free, safe, secure, certain | RG 234.30 and 234.120–122 ([RG 234](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)) |
| free power, free electricity, $0 bills, never pay a bill again, pays for itself | Shortfalls are billed. "Free" claims in energy are a common target ([ACCC Click Energy](https://www.accc.gov.au/media-release/click-energy-to-pay-900000-for-misleading-claims)) |
| save $X, X% savings, any price or payback figure | No reasonable grounds yet ([RG 234.109](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)) |
| better than super, term deposits, property or shares; build wealth; future-proof your income | Comparisons that recommend the product ([INFO 269](https://www.asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/discussing-financial-products-and-services-online)) |
| 100% clean, zero emissions, carbon neutral | Broad, unqualified green claims ([ACCC](https://www.accc.gov.au/media-release/accc-releases-eight-principles-to-guide-businesses%E2%80%99-environmental-claims)) |
| independent, unbiased, impartial | Restricted terms (RG 234.124) ([RG 234](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)) |
| pre-order, reserve or secure your panel, buy now, apply now, limited spots, only N left | They imply a sale, or create false scarcity ([Allens](https://www.allens.com.au/insights-news/insights/2026/07/australias-new-unfair-trading-practices-regime-what-businesses-need-to-know/)) |
| subscribe or subscription (for the product), cloud solar, virtual solar, community solar garden | Renting rather than owning, abstract, or tied to co-op lock-in ([competitor scan](https://www.solarcloud.com.au/)) |

**Use:** join the waitlist, coming soon, we're building, our plan is, planned, designed to, own, your panels, solar farm, sold to the grid, goes toward your bill, no roof needed, help shape Roofless, not available yet (no payment, no commitment).

### 5.5 Data handling
- **Region:** set the Vercel function region to `syd1` in `vercel.json` or in the dashboard, before the first signup. The default is iad1 (Washington, D.C.). Do not rely on Next `preferredRegion` ([Vercel](https://vercel.com/docs/functions/configuring-functions/region)).
- Create the Neon project in `aws-ap-southeast-2`. Its region cannot be changed later ([Neon](https://neon.com/pricing)).
- **Overseas disclosure:** storing data with an offshore provider is usually a "disclosure" under APP 8. Name the countries (the US) in the policy, and sign each provider's DPA ([OAIC APP 8](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information)).
- **Consent record per signup**, so we can prove consent ([ACMA](https://www.acma.gov.au/avoid-sending-spam)):
  - The email.
  - A UTC timestamp.
  - The consent text version.
  - The page URL and UTM source.
  - A truncated or hashed IP.
  - The confirmation timestamp, if any.
  
  The scaffold stores `consented_at`, `privacy_version` and `utm_*`. **It still needs** the page URL or referrer, a hashed IP and a suppression list.
- **Security** ([OAIC APP 11](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)):
  - Validate on the server.
  - Rate limit.
  - Keep secrets in Vercel environment variables.
  - Never put an email or postcode in a URL or in analytics events.
  - Restrict admin access.
  - Write a one-page breach plan.
- **Retention:** publish a period. For example: "deleted or de-identified 12 months after launch, or 24 months after signup if we have not launched." Honour deletion requests within 30 days, including at the email provider. Keep only a hashed suppression entry ([OAIC APP 11](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)).
- **Pixels:** launch without Meta or TikTok pixels. If you add them later, disclose them and send as little data as possible. A hashed email can still be personal information ([OAIC](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/tracking-pixels-and-privacy-obligations)).
- **APP exemption:** a business with turnover of $3M or less is probably exempt from the APPs today. Comply anyway. The Spam Act and the privacy tort apply regardless, and reform is under way ([OAIC](https://www.oaic.gov.au/privacy/privacy-for-organisations/small-business), [OAIC tort](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy), [AGD](https://consultations.ag.gov.au/rights-and-protections/privacy-reform/)).
- **Double opt-in:** ACMA says to "consider" it ([ACMA SoE DOCX](https://www.acma.gov.au/sites/default/files/2024-06/ACMA%20-%20Statement%20of%20Expectations%20-%20Use%20of%20consent%20in%20telemarketing%20~%20marketing%20FINAL_0.DOCX)). A confirmation email after a form signup is not "asking for consent by email", because consent was already given on the form.

### 5.6 Enforcement context (2026)
- Latitude Finance paid $3.96m for more than 2.7m spam breaches ([ACMA](https://www.acma.gov.au/articles/2026-04/latitude-finance-pays-396m-more-spam-breaches)).
- Solar businesses were penalised for fake testimonials ([ACCC](https://www.accc.gov.au/media-release/145000-penalty-for-fake-testimonials-and-false-solar-energy-country-of-origin-representations)).
- The unfair trading practices law passed and starts on 1 July 2027 ([Allens](https://www.allens.com.au/insights-news/insights/2026/07/australias-new-unfair-trading-practices-regime-what-businesses-need-to-know/)).

---

## 6. Statistics

### 6.1 Verified: safe to use

Show the data year and publisher next to every number. Render the footer "Sources" block from one data file.

| Figure | Safe phrasing | Source | Data year |
|---|---|---|---|
| 30.6% of households rent (2.84m) | "Nearly 1 in 3 Australian households rent." | [ABS Census 2021](https://www.abs.gov.au/statistics/people/housing/housing-census/2021) | 2021 |
| 11% of rentals have rooftop solar, vs nearly half of homes owned outright | "Only about 1 in 9 rental homes has rooftop solar, vs nearly half of homes owned outright (Energy Consumers Australia survey, 2025)." | [ECA](https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties) | 2025 |
| More than 4.5m homes **and small businesses** have rooftop solar | "Over 4.5 million Australian homes and small businesses already have rooftop solar (Clean Energy Council, 2026)." | [CEC](https://cleanenergycouncil.org.au/news-resources/rooftop-solar-storage-report-january-june-2026) | 2026 |
| 32.6% of NSW households rent | "Almost 1 in 3 NSW households rent (ABS Census 2021)." | [ABS QuickStats NSW](https://abs.gov.au/census/find-census-data/quickstats/2021/1) | 2021 |
| 10.3% of people (2.62m) live in apartments | "Over 2.5 million Australians live in apartments (ABS Census 2021)." | [ABS](https://www.abs.gov.au/media-centre/media-releases/2021-census-count-includes-australians-living-wheels-and-water-most-us-still-firmly-land) | 2021 |
| 70% of renters avoid heating or cooling to save money | "7 in 10 Australian renters say they avoid heating and cooling to save money (Energy Consumers Australia, 2025)." | [ECA](https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties) | 2025 |
| Renters are 3× less likely to have access to solar | "Renters are 3x less likely to have access to solar than homeowners (Climate Council, 2024, citing ECA)." | [Climate Council](https://www.climatecouncil.org.au/wp-content/uploads/2024/11/CC-Report-Seize-the-Sun.pdf) (printed p.23) | 2023–24 |
| More than 40% of free-standing homes have solar | "Over 40% of Australia's stand-alone houses have solar (IEA PVPS, 2025)." Keep any framing line visually separate from the citation. | [IEA PVPS](https://iea-pvps.org/about-iea-pvps/members/australia/) | 2025 |
| 1 in 3 **suitable** homes have rooftop solar | "About 1 in 3 suitable Australian homes has rooftop solar (Clean Energy Regulator, 2024)." | [CER](https://cer.gov.au/news-and-media/news/2024/december/australia-reaches-4-million-small-scale-renewable-energy-installations) | 2024 |
| A federal program funds shared solar for households without a usable roof | "The federal Community Solar Banks program already funds shared solar for households that can't use their own roof, especially renters and apartment dwellers." For "why now" or the FAQ only. Never imply we are linked to it. | [FFR](https://federalfinancialrelations.gov.au/node/4331) | 2023–2028 |

**Recommended stats bar:** the ABS 30.6%, the ECA 11% and the CEC 4.5m.

### 6.2 Do NOT use

| Do not use | Why |
|---|---|
| "4% of renters vs 29% of owners" with no year, or called NSW data | It is 2018 national data, cited second-hand from a source that cannot be found ([The Australia Institute](https://cdn.australiainstitute.org.au/2021/01/17084707/P943-Something-new-under-the-sun-Web.pdf)). If you must use it: "In 2018, about 4%…" |
| 11% (2025) next to 4% (2017–18) shown as a trend | The two use different methods ([ECA](https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties), [ANU](https://policybrief.anu.edu.au/solar-for-renters-designing-policies-to-promote-investment)) |
| "65% of renters would welcome solar" | A 2020 SA poll with about 118 renter respondents ([The Australia Institute](https://cdn.australiainstitute.org.au/2021/01/17084707/P943-Something-new-under-the-sun-Web.pdf)) |
| "Governments are already funding solar garden programs" | The NSW Solar Gardens stream is superseded. No current schedule has plot ownership ([FFR](https://federalfinancialrelations.gov.au/node/4331)) |
| "4.5 million homes" (dropping "small businesses"), or the CER's "4 million" as panels only | It misstates the source. The CER's 4m includes water heaters and heat pumps ([CEC](https://cleanenergycouncil.org.au/news-resources/rooftop-solar-storage-report-january-june-2026), [CER](https://cer.gov.au/news-and-media/news/2024/december/australia-reaches-4-million-small-scale-renewable-energy-installations)) |
| The CER's "$1,500 a year saving", UNSW's "$1,300–$1,432", or any payback years | Visitors could read them as Roofless returns ([CER](https://cer.gov.au/news-and-media/news/2024/december/australia-reaches-4-million-small-scale-renewable-energy-installations)) |
| Renters (30.6%) + apartments (14.2%) added into one "locked out" percentage | The groups overlap. Say "millions of renters and apartment dwellers" ([ABS](https://www.abs.gov.au/statistics/people/housing/housing-census/2021)) |
| "5.7 million households without solar" stated as a count | It is a modelled estimate from a PDF marked DRAFT. If you use it, label it an estimate ([UNSW/APVI](https://assets.nationbuilder.com/solarcitizens/pages/2838/attachments/original/1713002552/240414_Rooftop_Solar_Potential_of_Australian_Housing_Stock_by_Tenure_and_Dwelling.pdf?1713002552)) |
| Calling ECA a "statutory" body | It describes itself as "the independent, national voice" for energy consumers ([ECA](https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties)) |
| "Solar Sharer gives households free power" | It is opt-in, needs a smart meter, excludes embedded networks and is capped at 24 kWh a day ([Energy Made Easy](https://www.energymadeeasy.gov.au/hot-topics/solar-sharer-offer-what-you-need-to-know)) |
| Competitor savings figures used for comparison on our page | We have no grounds for our own numbers, so we have no fair basis to compare ([RG 234](https://download.asic.gov.au/media/cvcjdpy5/rg234-published-09-june-2026.pdf)) |
| Any signup count we have not reached, or a seeded number | Misleading conduct ([ACCC](https://www.accc.gov.au/media-release/145000-penalty-for-fake-testimonials-and-false-solar-energy-country-of-origin-representations)) |

**Refresh plan:** the first 2026 Census results (housing and tenure) are scheduled for June 2027 ([ABS](https://www.abs.gov.au/census/guide-census-data/2026-census-product-guide/2026)).

---

## 7. Stack and infrastructure

### 7.1 Packages (installed versions checked on 10 Oct 2026)

| Package | Version | Status | Note |
|---|---|---|---|
| next | 16.4.0 | installed | The latest stable release ([Next 16.4](https://nextjs.org/blog/next-16-4)). Upgrade to the patched release on **14 Oct** ([Next.js](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026)) |
| react, react-dom | 19.3.0 | installed | ViewTransition is stable. A Server Action reset now fires `onReset` ([React 19.3](https://react.dev/blog/2026/09/09/react-19-3)) |
| motion | 14.1.0 (exact) | installed | The only animation library. Roll back to 13.5.1 if it regresses ([CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md)) |
| tailwindcss + @tailwindcss/turbopack | 4.3.3 | installed (range `^4`) | Pin it. The turbopack loader has no npm provenance. `@tailwindcss/postcss` 4.3.3 is the documented fallback ([Tailwind](https://tailwindcss.com/docs/installation/framework-guides/nextjs)) |
| zod | 4.6.5 | installed | Use `z.string().trim().toLowerCase().pipe(z.email().max(254))`. The scaffold already does this ([Next forms](https://nextjs.org/docs/app/guides/forms)) |
| @neondatabase/serverless | 1.2.0 | installed | Tagged templates only. No ORM ([Neon](https://neon.com/docs/serverless/serverless-driver)) |
| @vercel/analytics | 2.0.1 | installed | No cookies. On Hobby: no custom events or UTMs, and 50k events shared across the account ([Vercel](https://vercel.com/docs/analytics/limits-and-pricing)) |
| typescript | 5.9.3 | installed | Do **not** move to 7.x. typescript-eslint caps at <6.1.0 ([Next TS](https://nextjs.org/docs/app/api-reference/config/typescript)) |
| eslint + eslint-config-next | 9.39.5 + 16.4.0 | installed | Stay on ESLint 9 ([Next ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)) |
| vitest, @vitejs/plugin-react, jsdom | 5.0.3, 6.1.2, 30.1.2 | installed | Vitest cannot render async Server Components. Cover them with E2E tests ([Next Vitest](https://nextjs.org/docs/app/guides/testing/vitest)) |
| @testing-library/react, dom, jest-dom, user-event | 16.3.3, 10.4.2, 7.0.1, 14.6.7 | installed | |
| @playwright/test | 1.64.0 | installed | Add `use: { reducedMotion: 'reduce' }` as a project. Set the webServer timeout to 120s ([Playwright](https://playwright.dev/docs/test-webserver)) |
| @axe-core/playwright | 4.13.0 | **add** | Accessibility scan of the page and the open modal |
| resend | 6.32.1 | **add** | Welcome email. Create the client lazily, because `new Resend()` throws without a key ([Resend](https://resend.com/docs/send-with-nextjs)) |
| @types/node | ^24 (24.19.2) | **change** from ^20 | Also add `"engines": { "node": "24.x" }`. Vercel defaults to Node 24 and has deprecated Node 20 ([Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)) |
| botid | 1.5.11 | optional | Invisible, and free in Basic mode. **Breaks pre-hydration form posts** ([BotID](https://vercel.com/docs/botid)) |
| @upstash/ratelimit + @upstash/redis | 2.2.0 + 1.39.0 | optional | A global rate limit in code ([Upstash](https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted)) |
| @vercel/firewall | 1.2.6 | optional | `checkRateLimit(id, { headers: await headers() })` matches the types. Test it on a preview deploy first ([Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)) |

**Do not add:**
- gsap. It is free, but it is not open source and brings nothing here ([GSAP license](https://gsap.com/standard-license)).
- lenis ([README](https://github.com/darkroomengineering/lenis)).
- three.js.
- @react-email/components. It is marked "no longer supported" ([React Email](https://react.email/docs/getting-started/manual-setup)).
- drizzle-orm.
- TypeScript 7.

### 7.2 Infrastructure steps
1. **Vercel project:** Root Directory `waitlist`, pnpm lockfile, Node 24.x. Add `vercel.json` with `{ "regions": ["syd1"] }` ([Vercel](https://vercel.com/docs/functions/configuring-functions/region)).
2. **Neon** through the Vercel Marketplace: Free plan, region `aws-ap-southeast-2`. The free plan gives 1 GB and 100 CU-hours per project. It scales to zero after 5 minutes, so the first query after idle is a cold start ([Neon](https://neon.com/pricing)). Run `pnpm db:migrate`.
3. **Why not Supabase:** free projects pause after 1 week of inactivity, which risks failed signups between the demo and launch ([Supabase](https://supabase.com/pricing)).
4. **Rate limit:**
   - The scaffold's limiter is in memory and counts per warm instance.
   - Add one Vercel WAF rule: Method = POST, Path = `/`, about 10 requests per 60s per IP. Run it in Log mode first. Hobby allows 1 rate-limit rule ([Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)).
5. **Abuse baseline:** a honeypot (the scaffold has `company_website`), zod validation, the unique email constraint and the WAF rule. Duplicates return the same success UI. Add Turnstile only if bots actually appear ([Cloudflare](https://developers.cloudflare.com/turnstile/plans/)).
6. **Email:**
   - Verify a sending subdomain in Resend **today**. Until it is verified, mail can only go to the account owner ([Resend](https://resend.com/docs/send-with-nextjs)).
   - Set up SPF, DKIM and DMARC ([Google sender guidelines](https://support.google.com/a/answer/81126)).
   - The free plan sends 100 emails a day. Treat a failed send as non-fatal.
   - Send from `after()` so the signup returns fast ([Next after](https://nextjs.org/docs/app/api-reference/functions/after)).
   - Use the idempotency key `welcome/${id}`.
7. **Static page:** keep the landing page fully static. Consider `export const ensureStatic = 'navigation'`. A live count would need `'use cache'`, `cacheLife('minutes')` and `updateTag` ([Next caching](https://nextjs.org/docs/app/getting-started/caching)).
8. **OG image:** `app/opengraph-image.tsx` with `ImageResponse`, 1200×630, in brand orange. It is built at build time ([Next OG](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image)).
9. **Release rule:**
   - Do not deploy during the demo window. Hobby has no Skew Protection, so an open tab can fail with "Failed to find Server Action" ([Vercel](https://vercel.com/docs/skew-protection)).
   - Action IDs also rotate at least every 14 days. Show a "Please refresh" retry state ([Next Server Actions](https://nextjs.org/docs/app/guides/server-actions)).
10. **Conversion record:** store `utm_*` and the referrer on each row. Conversion rate = rows ÷ Vercel page views.

---

## 8. Open questions for the team

**Legal and entity**
1. Do we have a legal entity (a company, or an ABN plus a business name)? Without one, emails cannot meet ACMA's sender identification, and the footer cannot name an issuer.
2. What will the legal structure be: title to specific panels, scheme interests, co-op units (the Haystacks model) or a retail energy contract? The answer decides whether "your panels stay yours when you move" is accurate.
3. Is a financial product already "reasonably likely"? Who will we ask (a lawyer, or the ASIC Innovation Hub), and before which launch step?
4. Will Roofless sell electricity itself, or settle bills through retailers? This affects AER/AEMO obligations and whether "works with any retailer" can be backed up. That was not researched here.
5. Will we ever raise money from waitlist members? If yes, plan how to keep it separate now (s734, s738ZG).

**Product and copy**
6. Home type options "rent / own / apartment" overlap, because an apartment can be rented or owned. Should we keep one question (the founder's spec) or ask two single-tap questions (tenure: rent/own, then dwelling: house/apartment)? The schema check constraint depends on this.
7. Is "Roofless" the final name and domain? Email authentication and the consent text depend on it.
8. Which referral reward, if any, can we honestly promise later? The demo recommendation is share-URL only.
9. What count threshold must we reach before we show a public counter? Should it be national or by state?
10. Is the founder happy with dawn → midday → golden hour as the story?
11. Should we add a visible "Reduce motion" toggle (the WCAG 2.3.3 AAA example), or rely on the OS setting only?

**Build and infra**
12. Hobby or Pro on Vercel? Pro adds Skew Protection, custom events, BotID Deep Analysis and more WAF rules.
13. Who makes the layered art (a designer's vector SVGs, or generated raster)? This sets the size budget.
14. Do we enforce BotID and accept that submits before hydration fail?
15. Single opt-in (the recommendation) or double opt-in? Which email provider and region?
16. What retention period will we publish, and who answers privacy@ within 30 days?
17. Is the Motion JS fallback in Firefox (2.8% of AU traffic) acceptable for the demo?
