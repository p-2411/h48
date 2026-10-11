import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { site } from "@/config/site";
import { HOME_TYPE_LABELS } from "@/lib/waitlist/schema";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses, stores and protects your personal information, and how to see, fix or delete it.`,
  alternates: { canonical: "/privacy" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-10" → "10 October 2026". Pure string work, so the page stays fully static. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "“I rent”, “I own” or “Apartment”", from the same labels the form uses. */
const homeTypes = Object.values(HOME_TYPE_LABELS)
  .map((label) => `\u201C${label}\u201D`)
  .join(", ")
  .replace(/, ([^,]*)$/, " or $1");

const OAIC_COMPLAINTS = "https://www.oaic.gov.au/privacy/privacy-complaints";

/** Who runs the site, as the policy names them. */
const operator = site.legalName
  ? `${site.legalName}${site.abn ? ` (ABN ${site.abn})` : ""}`
  : `the ${site.name} team (an entity is being set up)`;

/** What "we" means in this policy: the legal entity once it exists. */
const we = site.legalName || site.name;

const link =
  "rounded-sm font-medium text-ink underline decoration-sun decoration-2 underline-offset-[5px] transition-colors hover:decoration-ink motion-reduce:transition-none";

function Email({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} className={`${link} break-words`}>
      {address}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 scroll-mt-8">
      <h2 id={id} className="text-[22px] font-normal leading-[1.2] tracking-[-0.02em] text-ink text-balance sm:text-[26px]">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2.5 pl-5 marker:text-sun">{children}</ul>;
}

export default function PrivacyPage() {
  const updated = formatDate(site.privacyVersion);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5">
          <Link href="/" className="flex min-h-11 items-center gap-2.5 rounded-lg text-ink" aria-label={`${site.name} home`}>
            <LogoMark />
            <span className="text-[17px] font-medium tracking-[-0.02em]">{site.name}</span>
          </Link>
          <Link href="/" className={`${link} text-[15px]`}>
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 px-5 pb-24 pt-14 sm:pt-20">
        <article className="mx-auto max-w-[68ch] text-[17px] leading-[1.65] text-ink/90">
          <span aria-hidden="true" className="block size-3 rounded-full bg-sun shadow-[0_0_0_6px_rgb(255_106_19/0.16)]" />
          <h1 className="mt-6 text-[clamp(36px,6vw,56px)] font-normal leading-[1.02] tracking-[-0.02em] text-ink">
            Privacy Policy
          </h1>
          <p className="mt-4 text-[15px] text-slate">
            Last updated: <time dateTime={site.privacyVersion}>{updated}</time>
          </p>

          <p className="mt-8">
            This policy explains how {site.name} handles your personal information when you join our waitlist or use this
            website. We follow the Australian Privacy Principles (APPs) in the Privacy Act 1988.
          </p>

          <div className="mt-8 rounded-[24px] border border-peach bg-blush p-6 sm:p-8">
            <h2 className="text-[19px] font-normal text-ink">The short version</h2>
            <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 marker:text-sun">
              <li>We collect your email. Your home type and postcode are optional.</li>
              <li>We use them to tell you about our launch and to plan where to build.</li>
              <li>We never sell the list, and we use no advertising pixels.</li>
              <li>Our providers are US companies. Your sign-up is stored in Sydney.</li>
              <li>
                To see, fix or delete your details, email <Email address={site.privacyEmail} />.
              </li>
            </ul>
          </div>

          <Section id="who" title="Who we are">
            <p>
              This website is run by {operator}. In this policy, &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; mean{" "}
              {we}.
            </p>
          </Section>

          <Section id="collect" title="What we collect">
            <List>
              <li>
                <strong className="font-semibold text-ink">Your email address.</strong> You give it to us when you join the
                waitlist.
              </li>
              <li>
                <strong className="font-semibold text-ink">Your home type and postcode, if you choose to give them.</strong>{" "}
                Home type is one of {homeTypes}. Both questions are optional, and you can skip them.
              </li>
              <li>
                <strong className="font-semibold text-ink">Technical details about your sign-up.</strong> These are a one-way
                hash of your IP address (we never store the address itself), the page you landed on, the website that sent you
                here (the referrer), any campaign tags in the link (UTM tags), the time you agreed to hear from us, and the
                version of the privacy notice you saw.
              </li>
              <li>
                <strong className="font-semibold text-ink">Invite codes.</strong> We make an invite code for your share link.
                If you joined through someone else&apos;s share link, we record their code, so we know how you found us.
              </li>
              <li>
                <strong className="font-semibold text-ink">Page analytics.</strong> We use Vercel Web Analytics to count page
                views. It works without cookies and does not tell us who you are.
              </li>
            </List>
            <p>We don&apos;t ask for your name, phone number, street address or payment details.</p>
            <p>
              We don&apos;t set advertising or tracking cookies. After you join, your browser keeps your email and invite code
              in session storage, so the page still shows that you joined if you refresh. That note stays on your device and
              clears when you close the tab.
            </p>
          </Section>

          <Section id="how" title="How we collect it">
            <p>
              We collect your details only through the forms on this website: the waitlist email form, and the two optional
              questions that follow it. The technical details are collected automatically when you send a form. If you email
              us, we also get your email address and what you write.
            </p>
            <p>We don&apos;t buy lists, and we don&apos;t collect your details from anyone else.</p>
          </Section>

          <Section id="why" title="Why we collect it">
            <List>
              <li>
                To email you about our launch, early access and short surveys, until 12 months after launch or until you
                unsubscribe.
              </li>
              <li>To do research and plan where to build, using your home type and postcode.</li>
              <li>
                To keep a record that you agreed to hear from us. Australian spam law (the Spam Act 2003) requires us to show
                this if we are asked.
              </li>
              <li>
                To stop abuse of our forms. Our server keeps your IP address in its memory for a short time to block floods of
                sign-ups. We never save the address. We save only the one-way hash.
              </li>
            </List>
            <p>We won&apos;t use your details for anything else without asking you first.</p>
          </Section>

          <Section id="share" title="Who we share it with, and where it is stored">
            <p>We use two service providers to run this website. They handle your details only to provide their service to us.</p>
            <List>
              <li>
                <strong className="font-semibold text-ink">Vercel Inc.</strong> hosts this website and provides our page
                analytics. Vercel is a US company. The code that handles your sign-up runs in Vercel&apos;s Sydney region. Like
                any web host, Vercel uses your IP address to deliver pages and to block attacks.
              </li>
              <li>
                <strong className="font-semibold text-ink">Neon Inc.</strong> runs our database. Neon is a US company. Your
                details are stored in Sydney, Australia (region aws-ap-southeast-2).
              </li>
            </List>
            <p>
              We never sell the list, and we don&apos;t share it for advertising. We don&apos;t use advertising pixels, such as
              Meta or TikTok pixels. We will only disclose your details to anyone else if the law requires it.
            </p>
            <p>
              We don&apos;t send any emails yet. Before we do, we will choose an email provider and add it to this policy.
            </p>
          </Section>

          <Section id="overseas" title="Overseas disclosure">
            <p>
              Vercel and Neon are based in the United States. Your details are stored and processed in Sydney, but staff at
              these companies in the United States may be able to access them, for example to give support or keep the service
              running. Under the APPs, this can count as disclosing your information overseas.
            </p>
            <p>
              We choose providers that have data protection terms, and we take reasonable steps to make sure they handle your
              information in line with the APPs.
            </p>
          </Section>

          <Section id="retention" title="How long we keep it">
            <p>
              We keep your details until 12 months after we launch. If we haven&apos;t launched 24 months after you sign up, we
              keep them only until then. At the end of that time, we delete your details, or de-identify them so they can no
              longer identify you.
            </p>
            <p>
              If you ask us to delete your details, we do it within 30 days. We keep only a one-way hash of your email on a
              suppression list, so we never add you back by mistake.
            </p>
          </Section>

          <Section id="protect" title="How we protect it">
            <p>We take reasonable steps to protect your details from misuse, loss, and unauthorised access or changes. For example:</p>
            <List>
              <li>Your details travel over an encrypted connection (HTTPS), and our database encrypts them when stored.</li>
              <li>We check every form on our server and limit repeated attempts.</li>
              <li>We store a one-way hash of your IP address, never the address itself.</li>
              <li>We never put your email or postcode in web addresses or analytics.</li>
              <li>Only the people who run {we} and need the list can see it.</li>
            </List>
            <p>
              If a data breach is likely to cause you serious harm, we will tell you and the Office of the Australian
              Information Commissioner (OAIC).
            </p>
          </Section>

          <Section id="access" title="See, fix or delete your details">
            <p>
              You can ask to see the details we hold about you, correct them, or delete them. Email{" "}
              <Email address={site.privacyEmail} /> from the address you signed up with. We will reply within 30 days, and
              there is no charge. We may ask you to confirm the request comes from you.
            </p>
          </Section>

          <Section id="unsubscribe" title="Unsubscribing">
            <p>
              We don&apos;t send any emails until we have launch news. Every email we send will have a one-click unsubscribe
              link that works without signing in, and we act on it within 5 working days. You can also leave the list any time
              by emailing <Email address={site.privacyEmail} />.
            </p>
          </Section>

          <Section id="complaints" title="Complaints">
            <p>
              If you think we have mishandled your personal information, email <Email address={site.privacyEmail} /> and tell
              us what happened. We will reply within 30 days.
            </p>
            <p>
              If you are not happy with our reply, you can complain to the OAIC.{" "}
              <a href={OAIC_COMPLAINTS} className={link} rel="noopener">
                Make a privacy complaint on the OAIC website
              </a>
              .
            </p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>
              When we change this policy, we update the date at the top of this page. We record which version you agreed to
              when you joined. If we want to use your details in a new way, we will ask you first.
            </p>
          </Section>

          <Section id="contact" title="Contact us">
            <p>
              Privacy questions and requests: <Email address={site.privacyEmail} />.
              <br />
              Anything else: <Email address={site.contactEmail} />.
            </p>
            <p>This website is run by {operator}.</p>
          </Section>

          <p className="mt-16">
            <Link href="/" className={link}>
              Back to home
            </Link>
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
