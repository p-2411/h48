/** Everything brand- or launch-specific lives here, so a rename is one edit. */
export const site = {
  name: "Roofless",
  tagline: "Go Solar. Without a roof.",
  description:
    "Coming soon: own panels on a shared solar farm. The power is sold to the grid and the money goes toward your power bill. No roof needed. Join the waitlist.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  /** Shown in the privacy notice. Bump when the notice text changes; stored with each sign-up. */
  privacyVersion: "2026-10-10",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@example.com",
  /** Legal sender identity for the footer and emails. Leave empty until an entity exists; the footer omits it. */
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  abn: process.env.NEXT_PUBLIC_ABN || "",
  /** Real people only. Rendered in "Who's building this" when filled. */
  team: [] as { name: string; role: string; photo?: string }[],
  stats: [
    {
      text: "Nearly 1 in 3 Australian households rent.",
      source: "ABS, Housing: Census 2021",
      url: "https://www.abs.gov.au/statistics/people/housing/housing-census/2021",
    },
    {
      text: "Only about 1 in 9 rental homes has rooftop solar, compared with nearly half of homes owned outright.",
      source: "Energy Consumers Australia, December 2025",
      url: "https://energyconsumersaustralia.com.au/news/new-research-underlines-need-minimum-energy-efficiency-standards-australias-rental-properties",
    },
  ],
} as const;
