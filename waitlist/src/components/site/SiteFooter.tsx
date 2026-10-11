import Link from "next/link";

import { site } from "@/config/site";

import { LogoMark } from "./Logo";

/** " by Legal Name, ABN 12 345 678 901", or nothing until an entity exists. */
export function legalIdentity(): string {
  if (!site.legalName) return "";
  return ` by ${site.legalName}${site.abn ? `, ABN ${site.abn}` : ""}`;
}

const link =
  "rounded-sm text-ink underline decoration-ink/30 underline-offset-4 transition-colors hover:decoration-sun motion-reduce:transition-none";

/**
 * The end of the page: contact links, sources for every statistic, the illustration label and the
 * disclaimer (brief §5.2.5). Solid white so it reads cleanly after the scrolling scene.
 */
export function SiteFooter() {
  // The privacy address falls back to the contact address. Show it once in that case, but still
  // name it as the privacy contact (brief §5.2.5).
  const emails =
    site.privacyEmail === site.contactEmail
      ? [{ label: "Contact and privacy", address: site.contactEmail }]
      : [
          { label: "Contact", address: site.contactEmail },
          { label: "Privacy", address: site.privacyEmail },
        ];

  return (
    <footer className="border-t border-line bg-white text-[14px] leading-[1.6] text-slate">
      <div className="mx-auto max-w-[1200px] px-5 pb-12 pt-14 sm:pb-16 sm:pt-16">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 rounded-lg text-ink" aria-label={`${site.name} home`}>
              <LogoMark />
              <span className="text-[17px] font-medium tracking-[-0.02em]">{site.name}</span>
            </Link>
            <p className="mt-1 text-[15px] text-slate">{site.tagline}</p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-col gap-2 md:items-end">
              <li>
                <Link href="/privacy" className={link}>
                  Privacy Policy
                </Link>
              </li>
              {emails.map(({ label, address }) => (
                <li key={label} className="[overflow-wrap:anywhere]">
                  {label}:{" "}
                  <a href={`mailto:${address}`} className={link}>
                    {address}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 grid gap-8 border-t border-line pt-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
          <section aria-labelledby="footer-sources">
            <h2 id="footer-sources" className="text-[14px] font-semibold text-ink">
              Sources
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {site.stats.map((stat) => (
                <li key={stat.url}>
                  {stat.text}{" "}
                  <a href={stat.url} className={link} rel="noopener">
                    {stat.source}
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-col gap-3 text-[13px] leading-[1.65]">
            <p>Illustration. Farm site to be announced.</p>
            <p>
              {site.name} is a concept in development{legalIdentity()}. It is not available yet. Nothing on this site is an offer
              of, or invitation to apply for, any product, including any financial product, and nothing here is financial advice.
              We are not accepting money or applications. Features describe what we plan to build and may change.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
